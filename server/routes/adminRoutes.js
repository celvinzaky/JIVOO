/**
 * server/routes/adminRoutes.js
 * All routes here require: requireAuth + assertSuperAdmin (mounted below).
 * Base path: /api/admin
 */
const express = require('express');
const router = express.Router();

const storage = require('../services/jsonStorage');
const clientProvisioning = require('../services/clientProvisioning');
const statsService = require('../services/statsService');
const exportService = require('../services/exportService');
const auditLogger = require('../services/auditLogger');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/authMiddleware');
const { assertSuperAdmin } = require('../middleware/tenantContext');
const { CLIENT_STATUS } = require('../../shared/constants');

router.use(requireAuth, assertSuperAdmin);

// ---- Dashboard (§8.2) ----------------------------------------------------
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days, 10) || 14;
    const dashboard = await statsService.getPlatformDashboard({ days });
    res.json(dashboard);
  })
);

// ---- Create client (§8.3) — the 10-step provisioning flow -----------------
router.post(
  '/clients',
  asyncHandler(async (req, res) => {
    const result = await clientProvisioning.createClient(req.body || {}, req.actor);
    res.status(201).json(result);
  })
);

// ---- List / search / filter clients (§8.4) --------------------------------
router.get(
  '/clients',
  asyncHandler(async (req, res) => {
    const { q, status, page = '1', limit = '20' } = req.query;
    let clients = await storage.readSystemCollection('clients_registry.json');

    if (status) {
      clients = clients.filter((c) => c.status === status);
    }
    if (q) {
      const needle = q.toLowerCase();
      clients = clients.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.owner_email.toLowerCase().includes(needle) ||
          c.client_code.toLowerCase().includes(needle)
      );
    }

    clients.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const start = (pageNum - 1) * limitNum;
    const paged = clients.slice(start, start + limitNum);

    res.json({
      data: paged,
      pagination: { page: pageNum, limit: limitNum, total: clients.length, total_pages: Math.ceil(clients.length / limitNum) },
    });
  })
);

// ---- Client detail (§8.4) -------------------------------------------------
router.get(
  '/clients/:clientId',
  asyncHandler(async (req, res) => {
    const registry = await storage.readSystemCollection('clients_registry.json');
    const record = registry.find((c) => c.client_id === req.params.clientId);
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Client not found' });

    const [company, users] = await Promise.all([
      storage.readClientCollection(record.client_id, 'company'),
      storage.readClientCollection(record.client_id, 'users'),
    ]);

    res.json({
      client: record,
      company,
      users: users.map(({ password_hash, pin_hash, ...safe }) => safe),
      outlet_count: Array.isArray(company?.outlets) ? company.outlets.length : 0,
      user_count: users.length,
    });
  })
);

// ---- Activate / deactivate / suspend (never hard delete) (§8.4) -----------
router.patch(
  '/clients/:clientId/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const allowed = Object.values(CLIENT_STATUS);
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'bad_request', message: `status must be one of: ${allowed.join(', ')}` });
    }

    const registry = await storage.readSystemCollection('clients_registry.json');
    const idx = registry.findIndex((c) => c.client_id === req.params.clientId);
    if (idx === -1) return res.status(404).json({ error: 'not_found', message: 'Client not found' });

    const previousStatus = registry[idx].status;
    registry[idx] = { ...registry[idx], status, updated_at: new Date().toISOString() };
    await storage.writeSystemCollection('clients_registry.json', registry);

    await auditLogger.logSystemEvent({
      actorId: req.actor.sub,
      actorEmail: req.actor.email,
      action: 'CHANGE_CLIENT_STATUS',
      target: req.params.clientId,
      meta: { from: previousStatus, to: status },
    });

    res.json({ client: registry[idx] });
  })
);

// ---- Per-client statistics & monitoring (§8.5) -----------------------------
router.get(
  '/clients/:clientId/stats',
  asyncHandler(async (req, res) => {
    const registry = await storage.readSystemCollection('clients_registry.json');
    const record = registry.find((c) => c.client_id === req.params.clientId);
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Client not found' });

    const days = parseInt(req.query.days, 10) || 14;
    const stats = await statsService.getClientStats(req.params.clientId, { days });
    res.json(stats);
  })
);

// ---- Download all client data as zip (§8.6) — read-only, never deletes ----
router.get(
  '/clients/:clientId/export',
  asyncHandler(async (req, res) => {
    const registry = await storage.readSystemCollection('clients_registry.json');
    const record = registry.find((c) => c.client_id === req.params.clientId);
    if (!record) return res.status(404).json({ error: 'not_found', message: 'Client not found' });

    const safeName = record.name.replace(/[^a-zA-Z0-9_\-]+/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_backup.zip"`);

    await auditLogger.logSystemEvent({
      actorId: req.actor.sub,
      actorEmail: req.actor.email,
      action: 'EXPORT_CLIENT_DATA',
      target: req.params.clientId,
    });

    await exportService.streamClientBackup(req.params.clientId, res);
  })
);

module.exports = router;
