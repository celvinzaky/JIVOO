/**
 * server/services/authService.js
 * Handles password hashing/verification and JWT issuance/verification for
 * BOTH actor types in JIVOO:
 *   - super_admin  (system scope, lives in data/system/super_admins.json)
 *   - client user  (owner/manager/staff_back_office/cashier, lives in
 *                   data/clients/{client_id}/users.json)
 *
 * The JWT payload always carries `scope` ("system" | "client") so
 * downstream middleware (tenantContext.js) can enforce isolation without
 * re-reading the database on every request.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const storage = require('./jsonStorage');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function signRefreshToken(payload) {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwtSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret); // throws on invalid/expired
}

/**
 * Authenticate a super admin against data/system/super_admins.json
 */
async function authenticateSuperAdmin(email, password) {
  const admins = await storage.readSystemCollection('super_admins.json');
  const admin = admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!admin) return { ok: false, reason: 'not_found' };
  if (admin.status !== 'active') return { ok: false, reason: 'inactive' };

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return { ok: false, reason: 'bad_password' };

  const payload = {
    scope: 'system',
    sub: admin.id,
    role: 'super_admin',
    email: admin.email,
  };
  return {
    ok: true,
    admin: sanitizeAdmin(admin),
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

/**
 * Authenticate a client-scoped user (owner/manager/staff/cashier) against
 * data/clients/{client_id}/users.json. The caller must already know the
 * client_id (resolved from a login-time client/company lookup, e.g. by
 * matching email across the client's users.json in Part 2's login route).
 */
async function authenticateClientUser(clientId, username, password) {
  const clientRegistry = await storage.readSystemCollection('clients_registry.json');
  const clientRecord = clientRegistry.find((c) => c.client_id === clientId);
  if (!clientRecord) return { ok: false, reason: 'client_not_found' };
  if (clientRecord.status !== 'active') return { ok: false, reason: 'client_inactive' };

  const users = await storage.readClientCollection(clientId, 'users');
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase() || u.email?.toLowerCase() === username.toLowerCase()
  );
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.status !== 'active') return { ok: false, reason: 'inactive' };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, reason: 'bad_password' };

  // Resolve role_id -> role code + default module_access. The user's own
  // module_access (if set) overrides the role default, since Part 3's
  // Role/Permission management lets owners customize access per user.
  const roles = await storage.readClientCollection(clientId, 'roles');
  const roleRecord = roles.find((r) => r.id === user.role_id);
  const roleCode = roleRecord ? roleRecord.code : user.role || 'CUSTOM_ROLE';
  const moduleAccess = user.module_access && user.module_access.length
    ? user.module_access
    : await resolveDefaultModuleAccess(clientId, user.role_id);

  // Update last_login (best-effort - do not fail login if this write fails)
  storage
    .update(clientId, 'users', user.id, { last_login: new Date().toISOString() })
    .catch(() => {});

  const payload = {
    scope: 'client',
    sub: user.id,
    client_id: clientId,
    role: roleCode,
    role_id: user.role_id,
    module_access: moduleAccess,
    username: user.username,
  };
  return {
    ok: true,
    user: sanitizeUser(user),
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

async function resolveDefaultModuleAccess(clientId, roleId) {
  const permissions = await storage.readClientCollection(clientId, 'permissions');
  const perm = permissions.find((p) => p.role_id === roleId);
  return perm ? perm.module_access : [];
}

function sanitizeAdmin(admin) {
  const { password_hash, ...safe } = admin;
  return safe;
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  authenticateSuperAdmin,
  authenticateClientUser,
  sanitizeAdmin,
  sanitizeUser,
};
