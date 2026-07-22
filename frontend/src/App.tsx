import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Camera, Settings, History } from 'lucide-react';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Landing from './pages/Landing';
import './index.css';

function Sidebar() {
  return (
    <div className="sidebar">
      <div className="brand-title">Krishi Raksha</div>
      
      <Link to="/dashboard" className="nav-item active">
        <Home size={20} />
        Dashboard
      </Link>
      <Link to="/scan" className="nav-item">
        <Camera size={20} />
        New Scan
      </Link>
      <Link to="/history" className="nav-item">
        <History size={20} />
        History
      </Link>
      <Link to="/settings" className="nav-item">
        <Settings size={20} />
        Settings
      </Link>
    </div>
  );
}

function Dashboard() {
  const [healthStatus, setHealthStatus] = useState<string>('Checking connection...');

  useEffect(() => {
    fetch('/api/v1/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data.status || 'Connected'))
      .catch(() => setHealthStatus('Disconnected - Backend Offline'));
  }, []);

  return (
    <div>
      <h1>Welcome back, Farmer</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
        Here is your recent crop health overview. Backend Status: <span style={{ fontWeight: 'bold', color: healthStatus.includes('Offline') ? '#ba1a1a' : 'var(--color-brand-green)' }}>{healthStatus}</span>
      </p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div className="card">
          <h3>Recent Scans</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>You have no recent scans today.</p>
          <button className="btn-primary" onClick={() => window.location.href='/scan'}>
            Start a New Scan
          </button>
        </div>
        
        <div className="card">
          <h3>Local Outbreak Alerts</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No major outbreaks detected in your district in the last 48 hours.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScanPage() {
  return (
    <div>
      <h1>Upload Leaf Image</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
        Upload a clear photo of the affected crop leaf for AI diagnosis.
      </p>
      
      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{
          border: '2px dashed #E0D9CF',
          borderRadius: '10px',
          padding: '48px',
          textAlign: 'center',
          marginBottom: '24px'
        }}>
          <Camera size={48} color="#c0c9bc" style={{ marginBottom: '16px' }} />
          <p style={{ fontWeight: '600' }}>Click to browse or drag image here</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Supports JPG, PNG (Max 10MB)</p>
        </div>
        
        <button className="btn-primary" style={{ width: '100%' }}>
          Analyze Image
        </button>
      </div>
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuthPage = location.pathname === '/signin' || location.pathname === '/signup';
  const isLandingPage = location.pathname === '/';

  if (isAuthPage || isLandingPage) {
    return <>{children}</>;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/history" element={<div><h1>History</h1><p>Your scan history will appear here.</p></div>} />
          <Route path="/settings" element={<div><h1>Settings</h1><p>Application settings go here.</p></div>} />
        </Routes>
      </AppLayout>
    </Router>
  );
}

export default App;
