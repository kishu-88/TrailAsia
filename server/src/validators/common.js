'use strict';

const { z } = require('zod');
const ApiError = require('../utils/ApiError');

/** Turns a Zod schema into Express middleware over req.body. */
function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(toApiError(result.error));
    req.body = result.data;
    return next();
  };
}

/** Same, over req.query. The parsed result lands on req.validatedQuery. */
function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) return next(toApiError(result.error));
    req.validatedQuery = result.data;
    return next();
  };
}

function toApiError(error) {
  const details = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_';
    if (!details[field]) details[field] = issue.message;
  }
  return ApiError.badRequest('Some fields need attention.', {
    code: 'VALIDATION_ERROR',
    details,
  });
}

// --- Reusable pieces -------------------------------------------------------

/**
 * A positive integer id arriving as a string from JSON or a path parameter.
 *
 * The message is written for whoever is looking at the form, not for us: this
 * fires most often when a required dropdown was left empty, and "Must be an id"
 * tells that person nothing they can act on.
 */
const idLike = z.union([
  z.string().regex(/^\d+$/, 'Select a valid option.'),
  z.number().int().positive(),
]);

/** ISO date, `YYYY-MM-DD`. Dates without times avoid a world of timezone pain. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date.');

const currencyCode = z
  .string()
  .length(3, 'Use a three-letter currency code.')
  .transform((value) => value.toUpperCase());

const countryCode = z
  .string()
  .length(2, 'Use a two-letter country code.')
  .transform((value) => value.toUpperCase());

/** Money as a string, so nothing is ever put through a float. */
const money = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), 'Use a positive amount, e.g. 1250.00');

const password = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'That is longer than the maximum of 200 characters.');

/** Rejects an update whose body contains no recognised fields. */
function atLeastOneField(schema) {
  return schema.refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });
}

const paginationQuery = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  sort: z.string().optional(),
  q: z.string().optional(),
});

module.exports = {
  validateBody,
  validateQuery,
  idLike,
  dateOnly,
  currencyCode,
  countryCode,
  money,
  password,
  atLeastOneField,
  paginationQuery,
};
