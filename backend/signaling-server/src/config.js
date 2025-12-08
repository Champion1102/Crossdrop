/**
 * Signaling Server Configuration
 * All configurable parameters in one place
 */

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3001,
  host: process.env.HOST || '0.0.0.0',

  // WebSocket
  ws: {
    path: '/ws',
    maxPayloadSize: 64 * 1024, // 64KB max message size
  },

  // Heartbeat (keep connections alive)
  heartbeat: {
    interval: 30000,      // Send ping every 30s
    timeout: 10000,       // Wait 10s for pong before disconnect
  },

  // Room limits
  rooms: {
    maxPeersPerRoom: 10,
    maxRooms: 100,
  },

  // Cleanup
  cleanup: {
    interval: 30000,      // Check for stale peers every 30s
    peerTimeout: 60000,   // Remove peer after 60s of inactivity
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
  },

  // CORS (for HTTP endpoints)
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

module.exports = config;
