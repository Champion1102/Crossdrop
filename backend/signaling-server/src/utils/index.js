/**
 * Utils barrel export
 */

const logger = require('./logger');
const id = require('./id');

module.exports = {
  logger,
  ...id,
};
