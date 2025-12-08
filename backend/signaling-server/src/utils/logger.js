/**
 * Simple structured logger
 * Outputs JSON in production, pretty-prints in development
 */

const config = require('../config');

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[config.logging.level] || LEVELS.info;
const isDev = process.env.NODE_ENV !== 'production';

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (isDev) {
    // Pretty print for development
    const metaStr = Object.keys(meta).length > 0
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  // JSON for production (easier to parse in log aggregators)
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta,
  });
}

function log(level, message, meta) {
  if (LEVELS[level] < currentLevel) return;

  const output = formatMessage(level, message, meta);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

const logger = {
  debug: (message, meta) => log('debug', message, meta),
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),

  // Create a child logger with preset metadata
  child: (defaultMeta) => ({
    debug: (message, meta) => log('debug', message, { ...defaultMeta, ...meta }),
    info: (message, meta) => log('info', message, { ...defaultMeta, ...meta }),
    warn: (message, meta) => log('warn', message, { ...defaultMeta, ...meta }),
    error: (message, meta) => log('error', message, { ...defaultMeta, ...meta }),
  }),
};

module.exports = logger;
