/**
 * server/config/config.js
 * Loads and validates environment configuration for the JIVOO server.
 */
require('dotenv').config();
const path = require('path');

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET', 'dev_only_insecure_secret_change_me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  dataRoot: path.resolve(process.cwd(), process.env.DATA_ROOT || './data'),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  },
  superAdminSeed: {
    email: process.env.SUPERADMIN_EMAIL || 'superadmin@jivoo.local',
    password: process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!',
  },
};

module.exports = config;
