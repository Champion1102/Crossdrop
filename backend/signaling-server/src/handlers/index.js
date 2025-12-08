/**
 * Handlers barrel export
 */

const { handleConnection } = require('./connection');
const { handleMessage, handlers } = require('./message');

module.exports = {
  handleConnection,
  handleMessage,
  handlers,
};
