/**
 * server/middleware/tenantContext.js
 *
 * THIS IS THE CORE MULTI-TENANT ISOLATION GUARANTEE.
 * -----------------------------------------------------
 * Every client-scoped route MUST use `attachTenantContext` after
 * `requireAuth`. It:
 *   1. Confirms the authenticated actor has scope "client" (i.e. is a
 *      user of some client, not the super admin).
 *   2. Sets req.clientId strictly from the JWT payload - NEVER from a
 *      route param, query string, or request body. This is what
 *      prevents Client A from passing ?client_id=clientB to read
 *      Client B's data.
 *   3. Confirms the client is still active (rejects if suspended/inactive
 *      since JIVOO does not delete the client, only deactivates it -
 *      but inactive clients' users must not be able to transact).
 *
 * Any route handler that needs the tenant id should read `req.clientId`,
 * never `req.params.client_id` or `req.body.client_id`.
 */
const storage = require('../services/jsonStorage');

async function attachTenantContext(req, res, next) {
  if (!req.actor || req.actor.scope !== 'client') {
    return res.status(403).json({ error: 'forbidden', message: 'Client-scoped route requires a client user token' });
  }

  const clientId = req.actor.client_id;
  if (!clientId) {
    return res.status(403).json({ error: 'forbidden', message: 'Token missing client_id' });
  }

  try {
    const registry = await storage.readSystemCollection('clients_registry.json');
    const record = registry.find((c) => c.client_id === clientId);
    if (!record) {
      return res.status(404).json({ error: 'not_found', message: 'Client no longer exists' });
    }
    if (record.status !== 'active') {
      return res.status(403).json({ error: 'forbidden', message: `Client account is ${record.status}` });
    }

    // Frozen onto req so downstream handlers cannot accidentally override it
    Object.defineProperty(req, 'clientId', {
      value: clientId,
      writable: false,
      configurable: false,
    });
    req.clientRecord = record;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Defense-in-depth: if a route ever accepts a client_id in params/body for
 * super-admin cross-client operations, use this to assert it matches an
 * explicitly allowed super-admin action rather than trusting it blindly.
 * Client-scoped routes should never need this.
 */
function assertSuperAdmin(req, res, next) {
  if (!req.actor || req.actor.scope !== 'system' || req.actor.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden', message: 'Requires super_admin' });
  }
  next();
}

module.exports = { attachTenantContext, assertSuperAdmin };
