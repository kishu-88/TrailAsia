'use strict';

const { z } = require('zod');
const { dateOnly } = require('./common');

/**
 * Report query parameters.
 *
 * Both dates are optional — the service defaults to the last twelve months, so
 * the page renders something useful before anyone touches a control. `to`
 * before `from` is rejected rather than silently returning nothing, because an
 * empty report and an impossible date range look identical on screen and one of
 * them is a mistake somebody should be told about.
 */
const reportQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    horizonDays: z
      .string()
      .regex(/^\d{1,3}$/, 'Use a number of days.')
      .optional(),
  })
  .passthrough()
  .refine((value) => !value.from || !value.to || value.to >= value.from, {
    message: 'The end of the range cannot be before the start.',
    path: ['to'],
  });

module.exports = { reportQuerySchema };
