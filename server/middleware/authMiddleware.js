/**
 * server/middleware/authMiddleware.js
 * Verifies the Bearer JWT on protected routes and attaches `req.actor`
 * with the decoded payload ({ scope, sub, role, client_id?, ... }).
 * Does NOT enforce tenant isolation itself - see tenantContext.js for that.
 */
const authService = require('../services/authService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = authService.verifyToken(token);
    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'unauthorized', message: 'Refresh token cannot be used as access token' });
    }
    req.actor = decoded;
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: 'unauthorized', message });
  }
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.actor || req.actor.scope !== scope) {
      return res.status(403).json({ error: 'forbidden', message: `Requires ${scope} scope` });
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      return res.status(403).json({ error: 'forbidden', message: `Requires one of roles: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireScope, requireRole };
