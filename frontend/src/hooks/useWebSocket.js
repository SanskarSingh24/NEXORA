import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable React Hook for managing robust WebSocket connections with automatic
 * Exponential Backoff reconnect controls.
 *
 * Requirements satisfied:
 * - Detects unexpected disconnections.
 * - Auto-reconnect delay progression: 2s, 4s, 8s, 16s, max 30s.
 * - Resets retry counter on successful connection.
 * - Four states: Connected, Connecting, Reconnecting, Offline.
 * - Cache preservation: retains last telemetry frame during disconnect sweeps.
 * - Diagnostic events logging.
 */
export function useWebSocket(url, token = null) {
    const [data, setData] = useState(null);
    const [status, setStatus] = useState('Connecting'); // 'Connected', 'Connecting', 'Reconnecting', 'Offline'
    const [error, setError] = useState(null);

    const socketRef = useRef(null);
    const retryCountRef = useRef(0);
    const reconnectTimeoutRef = useRef(null);
    const isExplicitCloseRef = useRef(false);

    // Formulate absolute WS URL with authentication Token
    const getFullUrl = useCallback(() => {
        if (!url) return '';
        if (!token) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}token=${token}`;
    }, [url, token]);

    const connect = useCallback(() => {
        // Clear any pending reconnect timers
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        const fullUrl = getFullUrl();
        if (!fullUrl) return;

        isExplicitCloseRef.current = false;

        // Update status to reflecting Connecting or Reconnecting
        setStatus((prev) => (retryCountRef.current > 0 ? 'Reconnecting' : 'Connecting'));

        console.log(`[WebSocket] Initiating connection to: ${url}`);
        if (retryCountRef.current > 0) {
            console.log(`[WebSocket] Reconnect attempt #${retryCountRef.current}`);
        }

        try {
            const ws = new WebSocket(fullUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('[WebSocket] Connection opened successfully.');
                if (retryCountRef.current > 0) {
                    console.log('[WebSocket] Reconnect success achieved.');
                }
                setStatus('Connected');
                setError(null);
                retryCountRef.current = 0; // Reset retry counter on success
            };

            ws.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    setData(parsed); // Updates message payload cache
                } catch (err) {
                    console.error('[WebSocket] Parsing message error:', err);
                }
            };

            ws.onerror = (err) => {
                console.error('[WebSocket] Connection error event encountered:', err);
                setError(err);
            };

            ws.onclose = (event) => {
                console.log(`[WebSocket] Connection closed. Code: ${event.code}, Clean: ${event.wasClean}`);

                // Block auto-reconnect if closed intentionally by the client/operator
                if (isExplicitCloseRef.current) {
                    setStatus('Offline');
                    return;
                }

                // Determine reconnect delays using Exponential Backoff: 2s, 4s, 8s, 16s, capped at 30s
                retryCountRef.current += 1;
                const delay = Math.min(Math.pow(2, retryCountRef.current) * 1000, 30000);

                console.log(`[WebSocket] Reconnect failure. Next attempt scheduled in ${delay / 1000}s`);

                if (delay >= 30000 && retryCountRef.current > 6) {
                    // If retries keep failing extensively, flag as Offline eventually
                    setStatus('Offline');
                } else {
                    setStatus('Reconnecting');
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            };
        } catch (err) {
            console.error('[WebSocket] Instantiation failed:', err);
            setStatus('Offline');
            setError(err);
        }
    }, [getFullUrl, url]);

    const disconnect = useCallback(() => {
        isExplicitCloseRef.current = true;
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (socketRef.current) {
            console.log('[WebSocket] Disconnecting client connection context...');
            socketRef.current.close();
            socketRef.current = null;
        }
        setStatus('Offline');
    }, []);

    const sendMessage = useCallback((msg) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
            return true;
        }
        console.warn('[WebSocket] Cannot send message: client socket offline.');
        return false;
    }, []);

    useEffect(() => {
        connect();
        return () => {
            // Clean up on component unmount
            isExplicitCloseRef.current = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [connect]);

    return {
        status,
        data,
        error,
        sendMessage,
        reconnect: connect,
        disconnect,
    };
}
