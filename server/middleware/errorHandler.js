/**
 * server/middleware/errorHandler.js
 * Centralized error handler. Any route handler that calls next(err) or
 * throws inside an async handler wrapped by asyncHandler() ends up here.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error('[JIVOO][ERROR]', err);
  }

  res.status(status).json({
    error: err.code || 'server_error',
    message: err.message || 'Unexpected server error',
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
