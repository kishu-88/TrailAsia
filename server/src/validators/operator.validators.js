'use strict';

const { z } = require('zod');
const { atLeastOneField, currencyCode, dateOnly, idLike, money } = require('./common');

const OPERATOR_TYPES = [
  'guide',
  'accommodation',
  'transport',
  'permits',
  'equipment',
  'full_service',
  'other',
];

const SERVICE_TYPES = [
  'guide',
  'accommodation',
  'transport',
  'permits',
  'equipment',
  'other',
];

const createOperatorSchema = z.object({
  name: z.string().trim().min(1, 'Give the operator a name.').max(180),
  destinationId: idLike,
  type: z.enum(OPERATOR_TYPES).default('full_service'),
  contactName: z.string().trim().max(160).nullish(),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
  whatsapp: z.string().trim().max(40).nullish(),
  typicalResponseDays: z.number().int().min(0).max(120).default(3),
  notes: z.string().max(5000).nullish(),
});

const updateOperatorSchema = atLeastOneField(
  z
    .object({
      name: z.string().trim().min(1).max(180).optional(),
      destinationId: idLike.optional(),
      type: z.enum(OPERATOR_TYPES).optional(),
      contactName: z.string().trim().max(160).nullish(),
      contactEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').nullish(),
      contactPhone: z.string().trim().max(40).nullish(),
      whatsapp: z.string().trim().max(40).nullish(),
      typicalResponseDays: z.number().int().min(0).max(120).optional(),
      notes: z.string().max(5000).nullish(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

const vettingSchema = z.object({
  vetted: z.boolean(),
  notes: z.string().max(5000).nullish(),
});

const createConfirmationSchema = z.object({
  bookingId: idLike,
  operatorId: idLike,
  itinerarySegmentId: idLike.nullish(),
  serviceType: z.enum(SERVICE_TYPES).default('other'),
  summary: z.string().trim().min(1, 'Say what is being confirmed.').max(300),
  details: z.string().max(10000).nullish(),
  dueBy: dateOnly.nullish(),
  currencyCode: currencyCode.default('AUD'),
  amount: money.nullish(),
});

const updateConfirmationSchema = atLeastOneField(
  z
    .object({
      itinerarySegmentId: idLike.nullish(),
      serviceType: z.enum(SERVICE_TYPES).optional(),
      summary: z.string().trim().min(1).max(300).optional(),
      details: z.string().max(10000).nullish(),
      dueBy: dateOnly.nullish(),
      operatorReference: z.string().trim().max(120).nullish(),
      currencyCode: currencyCode.optional(),
      amount: money.nullish(),
    })
    .strict()
);

/**
 * Recording an answer.
 *
 * `reason` is required when declining — enforced in the service too, because a
 * decline with no recorded reason is the gap that makes a partner's history
 * unreadable six months later.
 */
const respondSchema = z
  .object({
    confirmed: z.boolean(),
    operatorReference: z.string().trim().max(120).nullish(),
    currencyCode: currencyCode.optional(),
    amount: money.nullish(),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine((value) => value.confirmed || Boolean(value.reason && value.reason.length >= 3), {
    message: 'Record why the operator declined.',
    path: ['reason'],
  });

const listQuerySchema = z
  .object({
    page: z.string().optional(),
    perPage: z.string().optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    bookingId: z.string().optional(),
    operatorId: z.string().optional(),
    destinationId: z.string().optional(),
    type: z.enum(OPERATOR_TYPES).optional(),
    serviceType: z.enum(SERVICE_TYPES).optional(),
    status: z.string().optional(),
    openOnly: z.string().optional(),
    overdueOnly: z.string().optional(),
    isActive: z.string().optional(),
    vetted: z.string().optional(),
  })
  .passthrough();

module.exports = {
  OPERATOR_TYPES,
  SERVICE_TYPES,
  createOperatorSchema,
  updateOperatorSchema,
  vettingSchema,
  createConfirmationSchema,
  updateConfirmationSchema,
  respondSchema,
  listQuerySchema,
};
