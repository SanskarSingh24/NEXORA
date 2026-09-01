import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable React Hook for managing robust WebSocket connections with:
 *  - Automatic Exponential Backoff reconnect for transient failures.
 *  - Auth-failure detection: on close code 1008 (policy violation / expired JWT)
 *    the hook stops blind retrying, attempts a silent token refresh via
 *    POST /auth/token/refresh, updates localStorage, and reconnects with the new token.
 *    If the refresh itself fails the hook dispatches a `nexora_auth_expired` window
 *    event so the app can redirect the user to the login page.
 *
 * States: 'Connected' | 'Connecting' | 'Reconnecting' | 'Offline' | 'AuthFailed'
 */
export function useWebSocket(url, token = null) {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('Connecting');
    const [error, setError] = useState(null);

    const socketRef = useRef(null);
    const retryCountRef = useRef(0);
    const reconnectTimeoutRef = useRef(null);
    const isExplicitCloseRef = useRef(false);
    const isRefreshingRef = useRef(false);
    // Keep a mutable copy of the latest token so the refresh flow can update it
    // without needing to recreate the entire connect callback.
    const currentTokenRef = useRef(token);

    // Keep the ref in sync with the prop each render.
    useEffect(() => {
        currentTokenRef.current = token;
    }, [token]);

    // ----------------------------------------------------------------
    // Helper: build full WS URL with auth token query param
    // ----------------------------------------------------------------
    const buildUrl = useCallback((tkn) => {
        if (!url) return '';
        if (!tkn) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}token=${tkn}`;
    }, [url]);

    // ----------------------------------------------------------------
    // Helper: attempt silent token refresh via /auth/token/refresh
    // Returns the new access token on success, null on failure.
    // ----------------------------------------------------------------
    const silentRefresh = useCallback(async () => {
        const refreshToken = localStorage.getItem('nexora_refresh_token');
        if (!refreshToken) return null;

        console.log('[WebSocket] Attempting silent token refresh...');
        try {
            let res;
            try {
                res = await fetch('http://localhost:8000/auth/token/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            } catch {
                res = await fetch('http://127.0.0.1:8000/auth/token/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            }

            if (!res || !res.ok) {
                console.warn('[WebSocket] Silent refresh failed — server rejected refresh token:', res?.status);
                return null;
            }

            const payload = await res.json();
            const newAccess = payload?.access_token;
            const newRefresh = payload?.refresh_token;

            if (!newAccess) {
                console.warn('[WebSocket] Silent refresh failed — no access_token in response.');
                return null;
            }

            // Persist the rotated tokens
            localStorage.setItem('nexora_token', newAccess);
            if (newRefresh) {
                localStorage.setItem('nexora_refresh_token', newRefresh);
            }
            currentTokenRef.current = newAccess;
            console.log('[WebSocket] Silent refresh succeeded — new access token stored.');
            return newAccess;
        } catch (err) {
            console.error('[WebSocket] Silent refresh network error:', err);
            return null;
        }
    }, []);

    // Helper: decode JWT payload without library to check exp claim
    const isTokenExpired = useCallback((tkn) => {
        if (!tkn) return true;
        try {
            const parts = tkn.split('.');
            if (parts.length !== 3) return true;
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (!payload.exp) return false;
            // Consider token expired if within 10 seconds of exp
            return payload.exp * 1000 <= Date.now() + 10000;
        } catch {
            return true;
        }
    }, []);

    // ----------------------------------------------------------------
    // Core connect function
    // ----------------------------------------------------------------
    const connect = useCallback(async (overrideToken) => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        let tkn = overrideToken !== undefined ? overrideToken : currentTokenRef.current;
        if (!tkn) {
            tkn = localStorage.getItem('nexora_token');
        }

        // Pro-actively check if the access token is expired BEFORE initiating WS connection
        if (tkn && isTokenExpired(tkn)) {
            console.warn('[WebSocket] Access token is expired. Attempting silent refresh before connecting...');
            if (!isRefreshingRef.current) {
                isRefreshingRef.current = true;
                tkn = await silentRefresh();
                isRefreshingRef.current = false;
            }
            if (!tkn) {
                console.error('[WebSocket] Token refresh failed. Redirecting to login.');
                localStorage.removeItem('nexora_token');
                localStorage.removeItem('nexora_refresh_token');
                setStatus('AuthFailed');
                window.dispatchEvent(new CustomEvent('nexora_auth_expired', {
                    detail: { reason: 'WebSocket auth token expired and refresh failed.' }
                }));
                return;
            }
        }

        const fullUrl = buildUrl(tkn);
        if (!fullUrl) return;

        isExplicitCloseRef.current = false;
        setStatus(retryCountRef.current > 0 ? 'Reconnecting' : 'Connecting');

        console.log(`[WebSocket] Connecting to: ${url}${retryCountRef.current > 0 ? ` (retry #${retryCountRef.current})` : ''}`);

        try {
            const ws = new WebSocket(fullUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('[WebSocket] Connection established.');
                setStatus('Connected');
                setError(null);
                retryCountRef.current = 0;
                isRefreshingRef.current = false;
            };

            ws.onmessage = (event) => {
                try {
                    setData(JSON.parse(event.data));
                } catch (err) {
                    console.error('[WebSocket] Message parse error:', err);
                }
            };

            ws.onerror = (evt) => {
                console.error('[WebSocket] Socket error:', evt);
                setError(evt);
            };

            ws.onclose = async (event) => {
                const { code, reason, wasClean } = event;
                console.log(`[WebSocket] Closed — code=${code} clean=${wasClean} reason="${reason}"`);

                // Intentional close — do not reconnect.
                if (isExplicitCloseRef.current) {
                    setStatus('Offline');
                    return;
                }

                // --------------------------------------------------------
                // Auth failure path: code 1008 = Policy Violation, or code 1006 with an expired token
                // --------------------------------------------------------
                const activeToken = currentTokenRef.current || localStorage.getItem('nexora_token');
                if (code === 1008 || (code === 1006 && isTokenExpired(activeToken))) {
                    // Guard: only one refresh attempt at a time.
                    if (isRefreshingRef.current) return;
                    isRefreshingRef.current = true;
                    setStatus('Reconnecting');
                    console.warn(`[WebSocket] Auth rejected or expired token (code ${code}). Attempting token refresh before reconnect.`);

                    const newToken = await silentRefresh();
                    isRefreshingRef.current = false;

                    if (newToken) {
                        // Reset retry counter — this isn't a transient network failure.
                        retryCountRef.current = 0;
                        reconnectTimeoutRef.current = setTimeout(() => {
                            connect(newToken);
                        }, 1000);
                    } else {
                        // Refresh failed — session is truly expired.
                        console.error('[WebSocket] Token refresh failed. Session expired. Redirecting to login.');
                        localStorage.removeItem('nexora_token');
                        localStorage.removeItem('nexora_refresh_token');
                        setStatus('AuthFailed');
                        // Signal the app to redirect to login.
                        window.dispatchEvent(new CustomEvent('nexora_auth_expired', {
                            detail: { reason: 'WebSocket auth token expired and refresh failed.' }
                        }));
                    }
                    return;
                }

                // --------------------------------------------------------
                // Transient failure path: exponential backoff reconnect.
                // --------------------------------------------------------
                retryCountRef.current += 1;
                const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);

                if (retryCountRef.current > 8) {
                    console.error('[WebSocket] Max retries exceeded. Giving up.');
                    setStatus('Offline');
                    return;
                }

                console.log(`[WebSocket] Reconnecting in ${delay / 1000}s (attempt #${retryCountRef.current}).`);
                setStatus('Reconnecting');
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            };
        } catch (err) {
            console.error('[WebSocket] Instantiation failed:', err);
            setStatus('Offline');
            setError(err);
        }
    }, [buildUrl, silentRefresh, url]);

    // ----------------------------------------------------------------
    // Manual disconnect
    // ----------------------------------------------------------------
    const disconnect = useCallback(() => {
        isExplicitCloseRef.current = true;
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (socketRef.current) {
            console.log('[WebSocket] Disconnecting...');
            socketRef.current.close();
            socketRef.current = null;
        }
        setStatus('Offline');
    }, []);

    // ----------------------------------------------------------------
    // Send helper
    // ----------------------------------------------------------------
    const sendMessage = useCallback((msg) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
            return true;
        }
        console.warn('[WebSocket] Cannot send — socket not open.');
        return false;
    }, []);

    // ----------------------------------------------------------------
    // Mount: initiate connection; unmount: clean up.
    // Re-connect whenever URL or token changes.
    // ----------------------------------------------------------------
    useEffect(() => {
        // Close any existing socket cleanly before opening a new one.
        if (socketRef.current) {
            isExplicitCloseRef.current = true;
            socketRef.current.close();
            socketRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        retryCountRef.current = 0;
        isExplicitCloseRef.current = false;
        isRefreshingRef.current = false;

        connect();

        return () => {
            isExplicitCloseRef.current = true;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (socketRef.current) socketRef.current.close();
        };
    }, [connect]);

    return {
        status,
        data,
        error,
        sendMessage,
        reconnect: () => { retryCountRef.current = 0; connect(); },
        disconnect,
    };
}
