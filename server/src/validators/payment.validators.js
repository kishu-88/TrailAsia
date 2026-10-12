'use strict';

const { z } = require('zod');
const { atLeastOneField, currencyCode, dateOnly, idLike, money } = require('./common');

const DIRECTIONS = ['incoming', 'outgoing'];
const METHODS = ['bank_transfer', 'card', 'cash', 'cheque', 'agent_credit', 'other'];

/**
 * An exchange rate: positive, up to eight decimal places.
 *
 * Eight because thinly traded pairs need them. NPR to AUD sits near
 * 0.01187500, and a two-place rate would round that to 0.01 — an error of
 * eighteen per cent, applied silently to every payment from Kathmandu.
 *
 * Kept as a string all the way to the database, like every other figure here,
 * so it is never put through a float.
 */
const exchangeRate = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .refine(
    (value) => /^\d{1,8}(\.\d{1,8})?$/.test(value) && Number.parseFloat(value) > 0,
    'Use a positive rate, e.g. 0.01187500'
  );

const createScheduleSchema = z.object({
  bookingId: idLike,
  label: z.string().trim().min(1, 'Name this instalment, e.g. Deposit.').max(120),
  sequence: z.number().int().min(1).max(100).optional(),
  dueOn: dateOnly,
  currencyCode: currencyCode.optional(),
  amount: money,
  notes: z.string().max(5000).nullish(),
});

const updateScheduleSchema = atLeastOneField(
  z
    .object({
      label: z.string().trim().min(1).max(120).optional(),
      sequence: z.number().int().min(1).max(100).optional(),
      dueOn: dateOnly.optional(),
      currencyCode: currencyCode.optional(),
      amount: money.optional(),
      notes: z.string().max(5000).nullish(),
    })
    .strict()
);

const closeScheduleSchema = z
  .object({
    status: z.enum(['waived', 'cancelled']),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine(
    (value) => value.status !== 'waived' || Boolean(value.reason && value.reason.length >= 3),
    { message: 'Say why this instalment is being written off.', path: ['reason'] }
  );

/**
 * Recording money.
 *
 * Note what this schema does not accept: a card number, an expiry, a CVV, a
 * cardholder name. `reference` is a bank or gateway identifier and nothing
 * else. Accepting card data at the edge is how it ends up in a log file, and
 * Section 8.3 keeps the agency out of PCI DSS scope by never handling it.
 */
const createPaymentSchema = z.object({
  bookingId: idLike,
  paymentScheduleId: idLike.nullish(),
  operatorConfirmationId: idLike.nullish(),

  direction: z.enum(DIRECTIONS).default('incoming'),
  method: z.enum(METHODS).default('bank_transfer'),
  // Defaults to pending: money is not in the bank until it has cleared, and a
  // form that defaults to "cleared" is a form that overstates the balance.
  status: z.enum(['pending', 'cleared']).default('pending'),

  currencyCode: currencyCode.optional(),
  amount: money,
  exchangeRate: exchangeRate.optional(),

  reference: z.string().trim().max(120).nullish(),
  receivedOn: dateOnly.optional(),
  notes: z.string().max(5000).nullish(),
});

/**
 * What can be corrected after the fact.
 *
 * Amount, currency, rate and direction are all absent on purpose. A wrong
 * amount is fixed by failing the row and recording the right one, so the ledger
 * shows both the error and the correction. See `updatePayment` in the service.
 */
const updatePaymentSchema = atLeastOneField(
  z
    .object({
      reference: z.string().trim().max(120).nullish(),
      receivedOn: dateOnly.optional(),
      method: z.enum(METHODS).optional(),
      paymentScheduleId: idLike.nullish(),
      notes: z.string().max(5000).nullish(),
    })
    .strict()
);

const settlePaymentSchema = z
  .object({
    status: z.enum(['cleared', 'failed', 'refunded']),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine(
    (value) =>
      value.status === 'cleared' || Boolean(value.reason && value.reason.length >= 3),
    { message: 'Say what happened to this payment.', path: ['reason'] }
  );

const listQuerySchema = z
  .object({
    page: z.string().optional(),
    perPage: z.string().optional(),
    sort: z.string().optional(),
    q: z.string().optional(),
    bookingId: z.string().optional(),
    paymentScheduleId: z.string().optional(),
    direction: z.enum(DIRECTIONS).optional(),
    method: z.enum(METHODS).optional(),
    status: z.string().optional(),
    liveOnly: z.string().optional(),
    overdueOnly: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();

module.exports = {
  DIRECTIONS,
  METHODS,
  exchangeRate,
  createScheduleSchema,
  updateScheduleSchema,
  closeScheduleSchema,
  createPaymentSchema,
  updatePaymentSchema,
  settlePaymentSchema,
  listQuerySchema,
};
