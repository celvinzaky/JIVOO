/**
 * server/services/idGenerator.js
 * Generates collision-resistant, prefixed IDs so records stay readable
 * (unlike raw UUIDs) while remaining safe across concurrent clients.
 * Format: {prefix}_{timestampBase36}{random6}
 */
const { v4: uuidv4 } = require('uuid');

function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}${rand}`;
}

function generateClientId() {
  return generateId('client');
}

function generateCompanyId() {
  return generateId('company');
}

function generateUserId() {
  return generateId('user');
}

function generateUuid() {
  return uuidv4();
}

module.exports = {
  generateId,
  generateClientId,
  generateCompanyId,
  generateUserId,
  generateUuid,
};
