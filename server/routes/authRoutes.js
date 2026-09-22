/**
 * server/routes/authRoutes.js
 * POST /api/auth/admin/login      - Super Admin login
 * POST /api/auth/client/login     - Client user login (owner/manager/staff/cashier)
 * POST /api/auth/refresh          - Exchange a refresh token for a new access token
 * POST /api/auth/logout           - Client-side token discard + audit log entry
 * GET  /api/auth/me               - Return the current actor (from token)
 */
const express = require('express');
const router = express.Router();

const authService = require('../services/authService');
const storage = require('../services/jsonStorage');
const auditLogger = require('../services/auditLogger');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/authMiddleware');

// ---- Super Admin login --------------------------------------------------
router.post(
  '/admin/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'bad_request', message: 'email and password are required' });
    }

    const result = await authService.authenticateSuperAdmin(email, password);
    if (!result.ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect' });
    }

    await auditLogger.logSystemEvent({
      actorId: result.admin.id,
      actorEmail: result.admin.email,
      action: 'login',
      target: 'super_admin_session',
    });

    res.json({
      admin: result.admin,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);

// ---- Client user login ---------------------------------------------------
// client_code identifies the tenant (short, url-safe code shown to the
// client at account creation, e.g. "demo001"). This avoids scanning every
// client's users.json to find a matching email/username.
router.post(
  '/client/login',
  asyncHandler(async (req, res) => {
    const { client_code, username, password } = req.body || {};
    if (!client_code || !username || !password) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'client_code, username and password are required',
      });
    }

    const registry = await storage.readSystemCollection('clients_registry.json');
    const clientRecord = registry.find((c) => c.client_code === client_code);
    if (!clientRecord) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid client code, username, or password' });
    }

    const result = await authService.authenticateClientUser(clientRecord.client_id, username, password);
    if (!result.ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid client code, username, or password' });
    }

    await auditLogger.logClientEvent(clientRecord.client_id, {
      actorId: result.user.id,
      actorUsername: result.user.username,
      action: 'login',
      target: 'client_session',
    });

    res.json({
      user: result.user,
      client: { client_id: clientRecord.client_id, client_code: clientRecord.client_code, name: clientRecord.name },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);

// ---- Refresh ---------------------------------------------------------------
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'bad_request', message: 'refreshToken is required' });
    }
    let decoded;
    try {
      decoded = authService.verifyToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired refresh token' });
    }
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'unauthorized', message: 'Not a refresh token' });
    }
    const { type, iat, exp, ...payload } = decoded;
    const accessToken = authService.signAccessToken(payload);
    res.json({ accessToken });
  })
);

// ---- Logout (audit only - JWTs are stateless so real invalidation would
// require a token blocklist, left as a documented future enhancement) -----
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.actor.scope === 'system') {
      await auditLogger.logSystemEvent({
        actorId: req.actor.sub,
        actorEmail: req.actor.email,
        action: 'logout',
      });
    } else {
      await auditLogger.logClientEvent(req.actor.client_id, {
        actorId: req.actor.sub,
        actorUsername: req.actor.username,
        action: 'logout',
      });
    }
    res.json({ ok: true });
  })
);

// ---- Current actor -----------------------------------------------------
router.get('/me', requireAuth, (req, res) => {
  res.json({ actor: req.actor });
});

module.exports = router;
