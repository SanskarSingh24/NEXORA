import { Routes, Route, NavLink } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import CrowdMapPage from './pages/CrowdMapPage';
import ReportsPage from './pages/ReportsPage';
import AlertsPage from './pages/AlertsPage';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/crowd-map', label: 'Crowd Map' },
  { to: '/reports', label: 'Reports' },
  { to: '/alerts', label: 'Alerts' },
];

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#05070f', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside style={{ width: 260, background: '#0b0f1e', borderRight: '1px solid #1e294b', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #00e5ff, #0066ff)' }} />
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.25rem' }}>NEXORA</div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 12 }}>
            Command Center
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  textDecoration: 'none',
                  color: isActive ? '#e2e8f0' : '#94a3b8',
                  background: isActive ? '#12182c' : 'transparent',
                  borderLeft: isActive ? '3px solid #00e5ff' : '3px solid transparent',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontWeight: 600,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main style={{ flex: 1, background: '#05070f' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/crowd-map" element={<CrowdMapPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
