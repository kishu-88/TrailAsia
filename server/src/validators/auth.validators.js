'use strict';

const { z } = require('zod');
const ApiError = require('../utils/ApiError');

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(1, 'Password is required.'),
});

/**
 * Turns a Zod schema into Express middleware. Validation failures come back as
 * a 400 with per-field messages the login form can render inline.
 */
function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || '_';
        if (!details[field]) details[field] = issue.message;
      }
      return next(
        ApiError.badRequest('Some fields need attention.', {
          code: 'VALIDATION_ERROR',
          details,
        })
      );
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { loginSchema, validateBody };
