import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Bird SVG - Simple artistic silhouette
const Bird = ({ className = "", style = {} }) => (
  <svg
    viewBox="0 0 50 20"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M0 10 Q 12 0, 25 10 Q 38 0, 50 10 Q 38 5, 25 10 Q 12 5, 0 10" />
  </svg>
);

// Cloud component - organic irregular shape
const Cloud = ({ className = "", size = "medium" }) => {
  const sizes = {
    small: "w-32 h-16",
    medium: "w-48 h-24",
    large: "w-72 h-36",
    xlarge: "w-96 h-48"
  };

  return (
    <div className={`absolute ${sizes[size]} ${className}`}>
      <svg viewBox="0 0 200 100" className="w-full h-full">
        <defs>
          <filter id="cloud-blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>
        <ellipse cx="60" cy="60" rx="50" ry="35" fill="rgba(255,255,255,0.85)" filter="url(#cloud-blur)" />
        <ellipse cx="100" cy="50" rx="45" ry="40" fill="rgba(255,255,255,0.9)" filter="url(#cloud-blur)" />
        <ellipse cx="140" cy="60" rx="50" ry="35" fill="rgba(255,255,255,0.85)" filter="url(#cloud-blur)" />
        <ellipse cx="80" cy="45" rx="35" ry="30" fill="rgba(255,255,255,0.95)" filter="url(#cloud-blur)" />
        <ellipse cx="120" cy="45" rx="35" ry="30" fill="rgba(255,255,255,0.95)" filter="url(#cloud-blur)" />
      </svg>
    </div>
  );
};

const Home = () => {
  return (
    <div className="sky-bg min-h-screen relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Clouds - scattered across the sky */}
      <Cloud size="xlarge" className="top-10 -left-20 opacity-70 animate-float-slow" />
      <Cloud size="large" className="top-32 right-10 opacity-60 animate-float" style={{ animationDelay: '1s' }} />
      <Cloud size="medium" className="top-20 left-1/3 opacity-50 animate-float-slow" style={{ animationDelay: '2s' }} />
      <Cloud size="small" className="bottom-40 left-20 opacity-40 animate-float" style={{ animationDelay: '0.5s' }} />
      <Cloud size="medium" className="bottom-20 right-1/4 opacity-50 animate-float-slow" style={{ animationDelay: '1.5s' }} />
      <Cloud size="large" className="top-1/2 -right-20 opacity-40 animate-float" style={{ animationDelay: '3s' }} />

      {/* Birds */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute top-32 left-1/4"
      >
        <Bird className="w-12 h-5 text-gray-600/60 animate-bird" />
      </motion.div>

      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="absolute top-24 right-1/3"
      >
        <Bird className="w-8 h-4 text-gray-500/50 animate-bird" style={{ animationDelay: '0.5s' }} />
      </motion.div>

      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute top-40 right-1/4"
      >
        <Bird className="w-6 h-3 text-gray-500/40 animate-bird" style={{ animationDelay: '1s' }} />
      </motion.div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        {/* Main bird icon */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <Bird className="w-20 h-8 text-gray-700/70 animate-bird" />
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="heading-hero text-center text-balance mb-6"
        >
          Let your files take
          <br />
          a safe flight
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-artistic text-center max-w-md mb-12"
        >
          Share files freely, directly between devices.
          <br />
          No clouds, no limits, just freedom.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <Link to="/transfer" className="btn-golden">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0-16l-4 4m4-4l4 4" />
            </svg>
            Start Transfer
          </Link>
        </motion.div>

        {/* Footer text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="absolute bottom-8 text-sm text-gray-500/60"
        >
          Peer-to-peer · End-to-end encrypted · Open source
        </motion.p>
      </div>
    </div>
  );
};

export default Home;
