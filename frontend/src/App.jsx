import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  Bell,
  FileText,
  Settings,
  Shield,
  LogOut,
  Mail,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  UserPlus,
  LogIn,
  KeyRound,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import CrowdMapPage from './pages/CrowdMapPage';
import ReportsPage from './pages/ReportsPage';
import AlertsPage from './pages/AlertsPage';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/crowd-map', label: 'Crowd Map', icon: Activity },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/alerts', label: 'Alerts', icon: Bell },
];

function VerifyEmailView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error'
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const hasFired = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided in URL.');
      return;
    }
    if (hasFired.current) return;
    hasFired.current = true;

    const verifyToken = async () => {
      try {
        let res;
        try {
          res = await fetch(`http://localhost:8000/auth/verify-email?token=${encodeURIComponent(token)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });
        } catch {
          res = await fetch(`http://127.0.0.1:8000/auth/verify-email?token=${encodeURIComponent(token)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });
        }
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Email successfully verified!');
        } else {
          setStatus('error');
          setMessage(data.detail || 'Verification failed. Token may be invalid or expired.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Network error connecting to authentication service.');
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="min-h-screen w-screen bg-bgPrimary flex items-center justify-center p-4 selection:bg-accentCyan selection:text-bgPrimary">
      <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none"></div>

      <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(30,41,75,0.3)] z-10 text-center">
        <div className="flex items-center justify-center gap-3.5 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-accentCyan to-accentBlue rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)]"></div>
          <h1 className="font-outfit font-extrabold text-2xl tracking-wider text-white">NEXORA Gateway</h1>
        </div>

        {status === 'loading' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 text-accentCyan animate-spin" />
            <p className="text-sm text-textMuted font-semibold">Verifying your email token...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-statusGreen/20 border border-statusGreen flex items-center justify-center text-statusGreen shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold text-white mb-1">Email Verified Successfully</h3>
              <p className="text-xs text-textMuted">{message}</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)] mt-4"
            >
              Proceed to Login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-statusRed/20 border border-statusRed flex items-center justify-center text-statusRed shadow-[0_0_20px_rgba(239,68,68,0.3)]">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold text-white mb-1">Verification Failed</h3>
              <p className="text-xs text-statusRed font-semibold">{message}</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-bgPrimary hover:bg-slate-900 border border-panelBorder text-white font-bold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all mt-4 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function ResetPasswordView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [pageStatus, setPageStatus] = useState('form'); // 'form', 'submitting', 'success', 'error'
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const navigate = useNavigate();

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!token) {
      setErrorMsg('No reset token found in the URL. Please use the link from your email.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please try again.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }

    setPageStatus('submitting');
    try {
      let res;
      try {
        res = await fetch('http://localhost:8000/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: newPassword }),
        });
      } catch {
        res = await fetch('http://127.0.0.1:8000/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: newPassword }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        setPageStatus('success');
        setSuccessMsg(data.message || 'Password reset successfully! You can now log in.');
      } else {
        setPageStatus('error');
        setErrorMsg(data.detail || 'Password reset failed. The link may have expired.');
      }
    } catch (err) {
      setPageStatus('error');
      setErrorMsg('Network error connecting to authentication service.');
    }
  };

  return (
    <div className="min-h-screen w-screen bg-bgPrimary flex items-center justify-center p-4 selection:bg-amber-400 selection:text-bgPrimary">
      <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none"></div>

      <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(30,41,75,0.3)] z-10">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-outfit font-extrabold text-xl tracking-wider text-white">Reset Password</h1>
            <p className="text-[11px] text-textMuted font-semibold uppercase tracking-wider mt-0.5">NEXORA Operator Access</p>
          </div>
        </div>

        {pageStatus === 'success' && (
          <div className="py-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-statusGreen/20 border border-statusGreen flex items-center justify-center text-statusGreen shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-outfit text-lg font-bold text-white mb-1">Password Updated</h3>
              <p className="text-xs text-textMuted">{successMsg}</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)] mt-2"
            >
              Proceed to Login
            </button>
          </div>
        )}

        {(pageStatus === 'form' || pageStatus === 'submitting' || pageStatus === 'error') && (
          <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-bgPrimary border border-panelBorder rounded-lg pl-9 pr-10 py-3 text-xs text-white outline-none focus:border-amber-500 transition-all"
                  placeholder="Min 8 chars, 1 upper, 1 lower, 1 number"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white transition-colors"
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-bgPrimary border border-panelBorder rounded-lg pl-9 pr-10 py-3 text-xs text-white outline-none focus:border-amber-500 transition-all"
                  placeholder="Re-enter your new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white transition-colors"
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs text-statusRed font-semibold flex items-center gap-1.5 bg-statusRed/5 border border-statusRed/20 p-3 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pageStatus === 'submitting'}
              className="bg-amber-500 hover:bg-amber-400 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {pageStatus === 'submitting' ? 'Resetting Password...' : 'Set New Password'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full text-textMuted hover:text-white font-bold text-xs uppercase tracking-wider py-2 flex items-center justify-center gap-1.5 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('nexora_token'));
  const [role, setRole] = useState(() => localStorage.getItem('nexora_role') || 'operator');
  const [username, setUsername] = useState(() => localStorage.getItem('nexora_user') || '');

  // Gateway Auth Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState('login');

  // Login Form States
  const [authUsername, setAuthUsername] = useState('admin@nexora.com');
  const [authPassword, setAuthPassword] = useState('StrongPass1');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authStatus, setAuthStatus] = useState('idle'); // 'idle', 'authenticating', 'error'
  const [authError, setAuthError] = useState(null);
  const [isUnverified, setIsUnverified] = useState(false);
  const [resendStatus, setResendStatus] = useState(null); // null, 'sending', 'sent', 'error'
  const [resendMessage, setResendMessage] = useState('');

  // Forgot Password Form States
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState('idle'); // 'idle', 'sending', 'sent', 'error'
  const [forgotMessage, setForgotMessage] = useState('');

  // Register Form States
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regRole, setRegRole] = useState('SECURITY_OFFICER');
  const [regStatus, setRegStatus] = useState('idle'); // 'idle', 'submitting', 'success', 'error'
  const [regError, setRegError] = useState(null);
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      localStorage.removeItem('nexora_token');
      localStorage.removeItem('nexora_refresh_token');
      localStorage.removeItem('nexora_role');
      localStorage.removeItem('nexora_user');
    }
  }, [token]);

  // Listen for auth expiry events from useWebSocket (JWT refresh failed).
  useEffect(() => {
    const onAuthExpired = (evt) => {
      console.warn('[App] nexora_auth_expired event received:', evt.detail?.reason);
      localStorage.removeItem('nexora_token');
      localStorage.removeItem('nexora_refresh_token');
      localStorage.removeItem('nexora_role');
      localStorage.removeItem('nexora_user');
      setToken(null);
      setRole('operator');
      setUsername('');
      navigate('/');
    };
    window.addEventListener('nexora_auth_expired', onAuthExpired);
    return () => window.removeEventListener('nexora_auth_expired', onAuthExpired);
  }, [navigate]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!authUsername || !authPassword) return;

    setAuthStatus('authenticating');
    setAuthError(null);
    setIsUnverified(false);
    setResendStatus(null);

    try {
      const params = new URLSearchParams({
        username_email: authUsername,
        password_raw: authPassword
      });

      const response = await fetch(`http://localhost:8000/auth/login?${params.toString()}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403 && (data.detail || '').toLowerCase().includes('not verified')) {
          setIsUnverified(true);
          throw new Error('Email address not verified. Please verify your email before logging in.');
        } else if (response.status === 401 || response.status === 400) {
          throw new Error(data.detail || 'Invalid username or password.');
        } else if (response.status === 403) {
          throw new Error(data.detail || 'Access forbidden: Account suspended.');
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait 60s.');
        } else {
          throw new Error(data.detail || 'Backend authentication service unavailable.');
        }
      }

      const accessToken = data.access_token;
      const refreshToken = data.refresh_token;
      const userRole = data.role || 'operator';

      localStorage.setItem('nexora_token', accessToken);
      if (refreshToken) localStorage.setItem('nexora_refresh_token', refreshToken);
      localStorage.setItem('nexora_role', userRole);
      localStorage.setItem('nexora_user', authUsername);

      setToken(accessToken);
      setRole(userRole);
      setUsername(authUsername);
      setAuthStatus('idle');
      navigate('/');
    } catch (err) {
      console.error('[Auth] Login error:', err);
      setAuthError(err.message);
      setAuthStatus('error');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotStatus('sending');
    setForgotMessage('');
    try {
      const res = await fetch('http://localhost:8000/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setForgotStatus('sent');
        setForgotMessage(data.message || 'If that email is registered, a reset link has been sent.');
      } else {
        setForgotStatus('error');
        setForgotMessage(data.detail || 'Failed to request password reset.');
      }
    } catch (err) {
      setForgotStatus('error');
      setForgotMessage('Network error. Please try again.');
    }
  };

  const handleResendVerification = async () => {
    if (!authUsername) return;
    setResendStatus('sending');
    setResendMessage('');

    try {
      const res = await fetch('http://localhost:8000/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authUsername })
      });
      const data = await res.json();
      if (res.ok) {
        setResendStatus('sent');
        setResendMessage(data.message || 'Verification link sent! Check your inbox.');
      } else {
        setResendStatus('error');
        setResendMessage(data.detail || 'Failed to resend verification link.');
      }
    } catch (err) {
      setResendStatus('error');
      setResendMessage('Network error. Unable to resend verification link.');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegStatus('submitting');
    setRegError(null);
    setRegSuccessMsg('');

    try {
      const res = await fetch('http://localhost:8000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          email: regEmail,
          password: regPassword,
          role: regRole
        })
      });

      const data = await res.json();

      if (!res.ok) {
        let msg = 'Registration failed.';
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            msg = data.detail.map(d => d.msg).join(' ');
          } else {
            msg = data.detail;
          }
        }
        throw new Error(msg);
      }

      setRegStatus('success');
      setRegSuccessMsg('Registration successful! A verification email has been sent to your address. Please verify your email before logging in.');
      setAuthUsername(regEmail);
      setAuthPassword('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
    } catch (err) {
      console.error('[Auth] Register error:', err);
      setRegError(err.message);
      setRegStatus('error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('nexora_token');
    localStorage.removeItem('nexora_refresh_token');
    localStorage.removeItem('nexora_role');
    localStorage.removeItem('nexora_user');
    setToken(null);
    setRole('operator');
    setUsername('');
    navigate('/');
  };

  // Render /reset-password page
  if (location.pathname === '/reset-password') {
    return <ResetPasswordView />;
  }

  // Render Verification Page if visiting /verify-email
  if (location.pathname === '/verify-email') {
    return <VerifyEmailView />;
  }

  // Render Gateway Login / Register Layout if unauthenticated
  if (!token) {
    return (
      <div className="min-h-screen w-screen bg-bgPrimary flex items-center justify-center p-4 selection:bg-accentCyan selection:text-bgPrimary">
        {/* Decorative cyber grid backdrop */}
        <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none"></div>

        <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(30,41,75,0.3)] z-10">

          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-7 h-7 bg-gradient-to-br from-accentCyan to-accentBlue rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)]"></div>
            <div>
              <h1 className="font-outfit font-extrabold text-2xl tracking-wider text-white">NEXORA Gateway</h1>
              <p className="text-[11px] text-textMuted font-semibold uppercase tracking-wider mt-0.5">Enterprise Command Center</p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-bgPrimary border border-panelBorder rounded-lg p-1 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-extrabold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-2 ${
                authMode === 'login'
                  ? 'bg-slate-900 text-accentCyan shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                  : 'text-textMuted hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setRegError(null); }}
              className={`flex-1 py-2 text-xs font-extrabold uppercase tracking-wider rounded-md transition-all flex items-center justify-center gap-2 ${
                authMode === 'register'
                  ? 'bg-slate-900 text-accentCyan shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                  : 'text-textMuted hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Register
            </button>
          </div>

          {/* LOGIN FORM */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Operator Username / Email</label>
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-3 text-xs text-white outline-none focus:border-accentCyan transition-all"
                  placeholder="admin@nexora.com"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Credentials Password</label>
                <div className="relative">
                  <input
                    type={showAuthPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-bgPrimary border border-panelBorder rounded-lg px-3.5 pr-10 py-3 text-xs text-white outline-none focus:border-accentCyan transition-all"
                    placeholder="••••••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword(!showAuthPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white transition-colors"
                    title={showAuthPassword ? "Hide password" : "Show password"}
                  >
                    {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="text-xs text-statusRed font-semibold flex flex-col gap-2 bg-statusRed/5 border border-statusRed/20 p-3.5 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <span>⚠️ {authError}</span>
                  </div>

                  {isUnverified && (
                    <div className="mt-1 pt-2 border-t border-statusRed/20 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendStatus === 'sending'}
                        className="bg-statusRed/20 hover:bg-statusRed/30 border border-statusRed/40 text-white font-bold py-2 px-3 rounded text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Mail className="w-3.5 h-3.5 text-accentCyan" />
                        {resendStatus === 'sending' ? 'Resending Link...' : 'Resend Verification Email'}
                      </button>

                      {resendMessage && (
                        <p className={`text-[11px] ${resendStatus === 'sent' ? 'text-statusGreen font-bold' : 'text-statusRed'}`}>
                          {resendMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={authStatus === 'authenticating'}
                className="bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)] disabled:opacity-50 mt-2"
              >
                {authStatus === 'authenticating' ? 'Verifying parameters...' : 'Initiate Secure Session'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthMode('forgot'); setForgotStatus('idle'); setForgotMessage(''); setForgotEmail(authUsername); }}
                className="w-full text-textMuted hover:text-accentCyan font-bold text-[11px] uppercase tracking-wider py-1.5 flex items-center justify-center gap-1.5 transition-all"
              >
                <KeyRound className="w-3 h-3" /> Forgot Password?
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {authMode === 'forgot' && (
            <div className="flex flex-col gap-4">
              {forgotStatus === 'sent' ? (
                <div className="py-4 flex flex-col items-center text-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                    <Mail className="w-5 h-5" />
                  </div>
                  <h4 className="font-outfit font-bold text-white text-sm">Check Your Inbox</h4>
                  <p className="text-xs text-textMuted">{forgotMessage}</p>
                  <p className="text-[11px] text-amber-400 font-semibold">The reset link expires in 15 minutes.</p>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setForgotStatus('idle'); }}
                    className="w-full bg-bgPrimary hover:bg-slate-900 border border-panelBorder text-white font-bold py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all mt-1 flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
                  <div className="text-center mb-2">
                    <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto mb-3">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-textMuted leading-relaxed">
                      Enter your registered email address and we'll send you a password reset link valid for 15 minutes.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Registered Email Address</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-3 text-xs text-white outline-none focus:border-amber-500 transition-all"
                      placeholder="operator@domain.com"
                      required
                    />
                  </div>

                  {forgotStatus === 'error' && forgotMessage && (
                    <div className="text-xs text-statusRed font-semibold flex items-center gap-1.5 bg-statusRed/5 border border-statusRed/20 p-3 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{forgotMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={forgotStatus === 'sending'}
                    className="bg-amber-500 hover:bg-amber-400 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {forgotStatus === 'sending' ? 'Sending Reset Link...' : 'Send Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setForgotStatus('idle'); }}
                    className="w-full text-textMuted hover:text-white font-bold text-[11px] uppercase tracking-wider py-1.5 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back to Login
                  </button>
                </form>
              )}
            </div>
          )}

          {/* REGISTER FORM */}
          {authMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4">
              {regStatus === 'success' ? (
                <div className="py-4 flex flex-col items-center text-center gap-3 bg-statusGreen/10 border border-statusGreen/30 rounded-xl p-4">
                  <CheckCircle2 className="w-8 h-8 text-statusGreen" />
                  <h4 className="font-outfit font-bold text-white text-sm">Verification Email Sent</h4>
                  <p className="text-xs text-textMuted">{regSuccessMsg}</p>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setRegStatus('idle'); }}
                    className="w-full bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all mt-2"
                  >
                    Proceed to Login
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Operator Username</label>
                    <input
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2.5 text-xs text-white outline-none focus:border-accentCyan transition-all"
                      placeholder="john_doe"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Email Address</label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2.5 text-xs text-white outline-none focus:border-accentCyan transition-all"
                      placeholder="operator@domain.com"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Password (1 Upper, 1 Lower, 1 Number)</label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-bgPrimary border border-panelBorder rounded-lg px-3.5 pr-10 py-2.5 text-xs text-white outline-none focus:border-accentCyan transition-all"
                        placeholder="••••••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white transition-colors"
                        title={showRegPassword ? "Hide password" : "Show password"}
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Assigned Clearance Role</label>
                    <select
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value)}
                      className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-2.5 text-xs text-white outline-none focus:border-accentCyan transition-all"
                    >
                      <option value="SECURITY_OFFICER">SECURITY_OFFICER (Standard Operator)</option>
                      <option value="EVENT_MANAGER">EVENT_MANAGER (Crowd & Analytics)</option>
                      <option value="ADMIN">ADMIN (System Administrator)</option>
                    </select>
                  </div>

                  {regError && (
                    <div className="text-xs text-statusRed font-semibold flex items-center gap-1.5 bg-statusRed/5 border border-statusRed/20 p-3 rounded-lg">
                      <span>⚠️ {regError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={regStatus === 'submitting'}
                    className="bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-3 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)] disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
                  >
                    {regStatus === 'submitting' ? 'Creating Profile & Sending Token...' : 'Register Operator Account'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    );
  }

  // Header Title matching tab
  const getHeaderTitle = () => {
    const matched = navItems.find(item => item.to === location.pathname);
    return matched ? `${matched.label} Command Screen` : 'NEXORA OPERATIONS';
  };

  return (
    <div className="min-h-screen w-screen bg-bgPrimary flex text-slate-200 overflow-hidden font-inter">
      {/* Decorative backdrop */}
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none"></div>

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-bgSecondary border-r border-[#1e294b] flex flex-col justify-between p-6 relative z-10 print:hidden flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-6 h-6 bg-gradient-to-br from-accentCyan to-accentBlue rounded-lg shadow-[0_0_10px_rgba(0,229,255,0.4)]"></div>
            <h1 className="font-outfit font-extrabold text-xl tracking-wider text-white">NEXORA</h1>
          </div>

          <hr className="border-[#1e294b] mb-6" />

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all 
                  ${isActive
                    ? 'bg-slate-900 text-accentCyan border-l-4 border-accentCyan shadow-[0_0_8px_rgba(0,229,255,0.15)]'
                    : 'text-textMuted hover:bg-[#12182c] hover:text-white border-l-4 border-transparent'
                  }
                `}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom system credentials status */}
        <div className="bg-bgPrimary/60 border border-panelBorder rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-statusGreen shadow-[0_0_8px_#10b981] animate-pulse"></div>
          <div className="text-left font-mono">
            <p className="text-[9px] text-textMuted font-bold uppercase tracking-widest">Active role</p>
            <p className="text-[10px] font-bold text-accentCyan uppercase">{role}</p>
          </div>
        </div>
      </aside>

      {/* Main workspace container */}
      <main className="flex-grow flex flex-col h-screen min-w-0 relative z-10">

        {/* Navbar */}
        <header className="h-[73px] bg-bgSecondary border-b border-[#1e294b] px-8 flex items-center justify-between print:hidden flex-shrink-0">
          <h2 className="font-outfit font-extrabold text-sm tracking-widest uppercase text-white">
            {getHeaderTitle()}
          </h2>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col text-right font-mono">
              <span className="text-[10px] text-textMuted font-semibold">User: {username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-textMuted hover:text-white font-bold uppercase tracking-wider flex items-center gap-1.5 p-2 rounded hover:bg-slate-900 transition-all"
            >
              <LogOut className="w-4 h-4 text-statusRed" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Dynamic content view */}
        <div className="flex-grow min-h-0 bg-bgPrimary">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/crowd-map" element={<CrowdMapPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </div>

      </main>
    </div>
  );
}
