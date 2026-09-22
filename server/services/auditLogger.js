/**
 * server/services/auditLogger.js
 * Appends audit trail entries at system scope (super admin actions) or
 * client scope (owner/manager/staff/cashier actions). Audit logs are
 * append-only from the application's perspective - there is no update/
 * delete helper exposed here on purpose.
 */
const storage = require('./jsonStorage');
const { generateId } = require('./idGenerator');

async function logSystemEvent({ actorId, actorEmail, action, target, meta }) {
  const logs = await storage.readSystemCollection('system_audit_logs.json');
  const entry = {
    id: generateId('log'),
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    target: target || null,
    meta: meta || {},
    created_at: new Date().toISOString(),
  };
  logs.push(entry);
  await storage.writeSystemCollection('system_audit_logs.json', logs);
  return entry;
}

async function logClientEvent(clientId, { actorId, actorUsername, action, target, meta }) {
  const logs = await storage.readClientCollection(clientId, 'audit_logs');
  const entry = {
    id: generateId('log'),
    client_id: clientId,
    actor_id: actorId,
    actor_username: actorUsername,
    action,
    target: target || null,
    meta: meta || {},
    created_at: new Date().toISOString(),
  };
  logs.push(entry);
  await storage.writeClientCollection(clientId, 'audit_logs', logs);
  return entry;
}

module.exports = { logSystemEvent, logClientEvent };
