'use strict';

/**
 * An error that is safe to show the caller. Anything thrown that is *not* an
 * ApiError is treated as a bug and reported as a generic 500, so internal
 * details never leak out of the API.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code = undefined, details = undefined } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, options) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...options });
  }

  static unauthorized(message = 'Authentication required.', options) {
    return new ApiError(401, message, { code: 'UNAUTHORIZED', ...options });
  }

  static forbidden(message = 'You do not have access to this resource.', options) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...options });
  }

  static notFound(message = 'Resource not found.', options) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...options });
  }

  static tooManyRequests(message = 'Too many requests.', options) {
    return new ApiError(429, message, { code: 'TOO_MANY_REQUESTS', ...options });
  }
}

module.exports = ApiError;
