import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import BrowserTransfer from './pages/BrowserTransfer';
import './index.css';

function App() {
  return (
    <Router>
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '50px',
            padding: '12px 24px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
            fontSize: '14px',
            color: '#1a1a1a',
          },
          success: {
            iconTheme: {
              primary: '#4ade80',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#f87171',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route path="/transfer" element={<BrowserTransfer />} />
        <Route path="/browser" element={<BrowserTransfer />} />
      </Routes>
    </Router>
  );
}

export default App;
