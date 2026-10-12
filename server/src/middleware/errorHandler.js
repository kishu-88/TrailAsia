'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/** 404 for anything that did not match a route. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

/**
 * Single error responder. Every error leaves the API in the same shape:
 *
 *   { "error": { "message": "...", "code": "...", "details": { ... } } }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
function errorHandler(error, _req, res, _next) {
  let apiError = error;

  // Translate the few library errors worth surfacing meaningfully.
  if (!(apiError instanceof ApiError)) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      apiError = ApiError.badRequest('That value is already in use.', {
        code: 'DUPLICATE_VALUE',
      });
    } else if (error.name === 'SequelizeValidationError') {
      const details = {};
      for (const item of error.errors || []) details[item.path] = item.message;
      apiError = ApiError.badRequest('Some fields need attention.', {
        code: 'VALIDATION_ERROR',
        details,
      });
    } else if (error.name === 'SequelizeConnectionRefusedError') {
      apiError = new ApiError(503, 'Database is unavailable.', {
        code: 'DATABASE_UNAVAILABLE',
      });
    } else if (error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
      apiError = ApiError.badRequest('That file is too large.', {
        code: 'FILE_TOO_LARGE',
        details: { file: 'Exceeds the maximum upload size.' },
      });
    } else if (error.name === 'MulterError') {
      apiError = ApiError.badRequest('That upload could not be read.', {
        code: 'INVALID_UPLOAD',
      });
    }
  }

  if (!(apiError instanceof ApiError)) {
    // An unexpected error is a bug. Log it in full, tell the caller nothing.
    // eslint-disable-next-line no-console
    console.error(error);
    apiError = new ApiError(500, 'Something went wrong on our end.', {
      code: 'INTERNAL_ERROR',
    });
  }

  const body = {
    error: {
      message: apiError.message,
      code: apiError.code,
    },
  };
  if (apiError.details) body.error.details = apiError.details;
  if (!env.isProduction && apiError.statusCode >= 500) body.error.stack = error.stack;

  res.status(apiError.statusCode).json(body);
}

module.exports = { notFound, errorHandler };
