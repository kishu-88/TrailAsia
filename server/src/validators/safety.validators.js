'use strict';

const { z } = require('zod');

const { idLike, paginationQuery } = require('./common');

/**
 * Numbers arrive from a phone as either JSON numbers or strings, depending on
 * how the client assembled the body. They are coerced once here rather than
 * being second-guessed in the service.
 */
const coerceNumber = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), 'Must be a number.');

const between = (min, max, message) =>
  coerceNumber.refine((value) => value >= min && value <= max, message);

const integerBetween = (min, max, message) =>
  coerceNumber.refine(
    (value) => Number.isInteger(value) && value >= min && value <= max,
    message
  );

const latitude = between(-90, 90, 'Latitude must be between -90 and 90.');
const longitude = between(-180, 180, 'Longitude must be between -180 and 180.');
const accuracyMetres = integerBetween(0, 100000, 'Accuracy must be a whole number of metres.');

const consentSchema = z.object({
  bookingId: idLike,
  granted: z.boolean({ required_error: 'Say whether sharing is on or off.' }),
});

const pingSchema = z.object({
  bookingId: idLike,
  latitude,
  longitude,
  accuracyMetres: accuracyMetres.optional(),
  // Below sea level is a real place, so this one is signed.
  altitudeMetres: integerBetween(-500, 9000, 'Altitude looks wrong.').optional(),
  batteryPercent: integerBetween(0, 100, 'Battery must be a percentage.').optional(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Everything on an SOS except the booking is optional.
 *
 * A phone with no fix, no signal to write a message and four seconds of battery
 * must still be able to raise one. Requiring a position would mean the alerts
 * that matter most are the ones that fail validation.
 */
const sosSchema = z.object({
  bookingId: idLike,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  accuracyMetres: accuracyMetres.optional(),
  message: z.string().trim().max(500, 'Keep it under 500 characters.').optional(),
});

const resolveSchema = z.object({
  // Required. A closed alert with no account of how it was closed is not a
  // record of anything, and this is the field an incident review reads first.
  notes: z
    .string({ required_error: 'Say what happened before closing this alert.' })
    .trim()
    .min(5, 'Say what happened before closing this alert.')
    .max(2000, 'Keep it under 2000 characters.'),
});

/**
 * `userId: null` unassigns. Omitting the field entirely is a validation
 * error rather than a no-op — "assign this" with nothing to assign it to is
 * almost certainly a client bug, not an intentional clear.
 */
const assignSchema = z.object({
  userId: idLike.nullable(),
});

const alertQuerySchema = z.object({
  status: z.enum(['open', 'raised', 'acknowledged', 'resolved', 'cancelled']).optional(),
  bookingId: idLike.optional(),
});

const pingQuerySchema = z.object({
  bookingId: idLike,
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value))
    .optional(),
});

const summaryQuerySchema = z.object({ bookingId: idLike });

const eventQuerySchema = paginationQuery.extend({
  type: z
    .enum(['raised', 'acknowledged', 'assigned', 'unassigned', 'escalated', 'resolved', 'cancelled'])
    .optional(),
  alertId: idLike.optional(),
  bookingId: idLike.optional(),
});

module.exports = {
  consentSchema,
  pingSchema,
  sosSchema,
  resolveSchema,
  assignSchema,
  alertQuerySchema,
  pingQuerySchema,
  summaryQuerySchema,
  eventQuerySchema,
};
