import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  BarChart3,
  Bell,
  FileText,
  Settings,
  Shield,
  LogOut
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

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('nexora_token'));
  const [role, setRole] = useState(() => localStorage.getItem('nexora_role') || 'operator');
  const [username, setUsername] = useState(() => localStorage.getItem('nexora_user') || '');

  const [authUsername, setAuthUsername] = useState('admin@nexora.com');
  const [authPassword, setAuthPassword] = useState('StrongPass1');
  const [authStatus, setAuthStatus] = useState('idle'); // 'idle', 'authenticating', 'error'
  const [authError, setAuthError] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to Dashboard if logged in and typing manual URL or auth state changes
  useEffect(() => {
    if (!token) {
      localStorage.removeItem('nexora_token');
      localStorage.removeItem('nexora_role');
      localStorage.removeItem('nexora_user');
    }
  }, [token]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!authUsername || !authPassword) return;

    setAuthStatus('authenticating');
    setAuthError(null);

    try {
      const params = new URLSearchParams({
        username_email: authUsername,
        password_raw: authPassword
      });

      const response = await fetch(`http://localhost:8000/auth/login?${params.toString()}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          throw new Error('Invalid username or password.');
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait 60s.');
        } else {
          throw new Error('Backend operations offline.');
        }
      }

      const data = await response.json();
      const accessToken = data.access_token;

      // Seed roles from access token or endpoint response
      const userRole = data.role || 'operator';

      localStorage.setItem('nexora_token', accessToken);
      localStorage.setItem('nexora_role', userRole);
      localStorage.setItem('nexora_user', authUsername);

      setToken(accessToken);
      setRole(userRole);
      setUsername(authUsername);
      setAuthStatus('idle');
      navigate('/');
    } catch (err) {
      console.error('[Auth] Login error encounter:', err);
      setAuthError(err.message);
      setAuthStatus('error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('nexora_token');
    localStorage.removeItem('nexora_role');
    localStorage.removeItem('nexora_user');
    setToken(null);
    setRole('operator');
    setUsername('');
    navigate('/');
  };

  // Render Login Layout if.unauthenticated
  if (!token) {
    return (
      <div className="min-h-screen w-screen bg-bgPrimary flex items-center justify-center p-4 selection:bg-accentCyan selection:text-bgPrimary">
        {/* Decorative cyber grid backdrop */}
        <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none"></div>

        <div className="max-w-md w-full bg-bgSecondary border border-panelBorder rounded-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(30,41,75,0.3)] z-10">

          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-7 h-7 bg-gradient-to-br from-accentCyan to-accentBlue rounded-xl shadow-[0_0_15px_rgba(0,229,255,0.4)]"></div>
            <div>
              <h1 className="font-outfit font-extrabold text-2xl tracking-wider text-white">NEXORA Secure Gateway</h1>
              <p className="text-[11px] text-textMuted font-semibold uppercase tracking-wider mt-0.5">Enterprise Command Center</p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Operator Username/Email</label>
              <input
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-3 text-xs text-white outline-none focus:border-accentCyan transition-all"
                placeholder="admin@nexora.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Credentials Token</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="bg-bgPrimary border border-panelBorder rounded-lg px-3.5 py-3 text-xs text-white outline-none focus:border-accentCyan transition-all"
                placeholder="••••••••••••••"
                required
              />
            </div>

            {authError && (
              <div className="text-xs text-statusRed font-semibold flex items-center gap-1.5 bg-statusRed/5 border border-statusRed/20 p-3 rounded-lg">
                <span>⚠️ {authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authStatus === 'authenticating'}
              className="bg-accentCyan hover:bg-cyan-500 text-bgPrimary font-extrabold py-3.5 rounded-lg text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)] disabled:opacity-50 mt-2"
            >
              {authStatus === 'authenticating' ? 'Verifying parameters...' : 'Initiate Secure Session'}
            </button>
          </form>
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
