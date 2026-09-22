/**
 * server/server.js
 * JIVOO minimal server/API layer.
 *
 * Why a server at all, given the requirement says "JSON database"?
 * A static browser app cannot safely be the storage server for a
 * multi-device, multi-user, multi-client system - there is no place for
 * multiple devices to read/write a shared JSON file directly. This thin
 * Express layer is that shared point: it owns the JSON files on disk via
 * server/services/jsonStorage.js and exposes a REST API. Every frontend
 * app (admin/, client/, cashier/) talks to this API - none of them touch
 * the filesystem directly.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/config');
const authRoutes = require('./routes/authRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ---- Core middleware -----------------------------------------------------
app.use(helmet());
app.use(cors()); // Part 10 will lock this down to known origins for production
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ---- Health check ----------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'jivoo-server', time: new Date().toISOString() });
});

// ---- Routes ------------------------------------------------------------
// Part 1 ships authentication only. Part 2 adds /api/admin/clients (Super
// Admin client management). Part 3+ add /api/back-office/* and
// /api/cashier/* routers, all mounted the same way below.
app.use('/api/auth', authRoutes);

// Static hosting for the frontend apps (filled in from Part 2 onward).
// Kept here now so the folder layout is final from Part 1.
app.use('/admin', express.static('admin'));
app.use('/client', express.static('client'));
app.use('/cashier', express.static('cashier'));
app.use('/assets', express.static('assets'));
app.use(express.static('.', { index: false })); // manifest.json, service-worker.js, etc. (Part 8)

// ---- 404 + error handling (must be last) ---------------------------------
app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`JIVOO server listening on http://localhost:${config.port} [${config.nodeEnv}]`);
  console.log(`Data root: ${config.dataRoot}`);
});

module.exports = app;
