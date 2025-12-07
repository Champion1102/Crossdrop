// Application configuration
// Set VITE_API_URL in .env file for your environment

const getApiUrl = () => {
  // 1. First priority: Environment variable (for production hosting)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // 2. Development: Use same hostname with backend port
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:8000`;
  }

  // 3. Production fallback: Assume API is on same origin (reverse proxy setup)
  // Or use relative URLs if backend is served from same domain
  return '';
};

const getSignalingUrl = () => {
  // 1. First priority: Environment variable
  if (import.meta.env.VITE_SIGNALING_URL) {
    return import.meta.env.VITE_SIGNALING_URL;
  }

  // 2. Development: Use same hostname with signaling port
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:3001`;
  }

  // 3. Production fallback
  return '';
};

const config = {
  // API base URL (FastAPI backend)
  API_BASE_URL: getApiUrl(),

  // Signaling server URL (Node.js WebSocket server)
  SIGNALING_URL: getSignalingUrl(),

  // Feature flags
  ENABLE_DEBUG: import.meta.env.VITE_ENABLE_DEBUG === 'true' || import.meta.env.DEV,

  // App info
  APP_NAME: 'CrossDrop',
  VERSION: '1.0.0',
};

// Log config in development
if (config.ENABLE_DEBUG) {
  console.log('CrossDrop Config:', {
    API_BASE_URL: config.API_BASE_URL,
    MODE: import.meta.env.MODE,
  });
}

export default config;
