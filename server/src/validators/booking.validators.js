'use strict';

const { z } = require('zod');
const { atLeastOneField, currencyCode, dateOnly, idLike, money } = require('./common');

const STATUSES = ['enquiry', 'quoted', 'confirmed', 'in_progress', 'completed', 'cancelled'];

const createBookingSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the booking a title.').max(200),
    consultantId: idLike.optional(),
    coordinatorId: idLike.nullish(),
    leadTravellerId: idLike.nullish(),
    travellerIds: z.array(idLike).max(60).optional(),
    departureDate: dateOnly.nullish(),
    returnDate: dateOnly.nullish(),
    partySize: z.number().int().min(1).max(200).default(1),
    currencyCode: currencyCode.default('AUD'),
    totalAmount: money.nullish(),
    depositAmount: money.nullish(),
    notes: z.string().max(10000).nullish(),
  })
  .refine(
    (value) => !(value.departureDate && value.returnDate) || value.returnDate >= value.departureDate,
    { message: 'Return date cannot be before departure.', path: ['returnDate'] }
  );

const updateBookingSchema = atLeastOneField(
  z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      // 'cancelled' is deliberately absent — cancelling requires a reason and
      // goes through POST /bookings/:id/cancel.
      status: z.enum(STATUSES.filter((s) => s !== 'cancelled')).optional(),
      consultantId: idLike.optional(),
      coordinatorId: idLike.nullish(),
      leadTravellerId: idLike.nullish(),
      departureDate: dateOnly.nullish(),
      returnDate: dateOnly.nullish(),
      partySize: z.number().int().min(1).max(200).optional(),
      currencyCode: currencyCode.optional(),
      totalAmount: money.nullish(),
      depositAmount: money.nullish(),
      notes: z.string().max(10000).nullish(),
    })
    .strict()
);

const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3, 'Record why this booking was cancelled.').max(500),
});

const addTravellerSchema = z.object({
  travellerId: idLike,
  isLead: z.boolean().default(false),
  notes: z.string().max(500).nullish(),
});

const createSegmentSchema = z
  .object({
    destinationId: idLike,
    sequence: z.number().int().min(1).max(200).optional(),
    title: z.string().trim().min(1, 'Give the segment a title.').max(200),
    description: z.string().max(10000).nullish(),
    startDate: dateOnly.nullish(),
    endDate: dateOnly.nullish(),
    accommodation: z.string().trim().max(300).nullish(),
    transportNotes: z.string().max(10000).nullish(),
    maxAltitudeMetres: z.number().int().min(0).max(9000).nullish(),
  })
  .refine(
    (value) => !(value.startDate && value.endDate) || value.endDate >= value.startDate,
    { message: 'End date cannot be before the start date.', path: ['endDate'] }
  );

const updateSegmentSchema = atLeastOneField(
  z
    .object({
      destinationId: idLike.optional(),
      sequence: z.number().int().min(1).max(200).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(10000).nullish(),
      startDate: dateOnly.nullish(),
      endDate: dateOnly.nullish(),
      accommodation: z.string().trim().max(300).nullish(),
      transportNotes: z.string().max(10000).nullish(),
      maxAltitudeMetres: z.number().int().min(0).max(9000).nullish(),
    })
    .strict()
);

const reorderSegmentsSchema = z.object({
  segmentIds: z.array(idLike).min(1, 'List the segments in their new order.'),
});

module.exports = {
  STATUSES,
  createBookingSchema,
  updateBookingSchema,
  cancelBookingSchema,
  addTravellerSchema,
  createSegmentSchema,
  updateSegmentSchema,
  reorderSegmentsSchema,
};
