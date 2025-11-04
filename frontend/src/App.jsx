import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import DeviceTransfer from './pages/DeviceTransfer';
import AIChat from './pages/AIChat';
import './index.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white dark:bg-black">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/transfer" element={<DeviceTransfer />} />
          <Route path="/ai" element={<AIChat />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
