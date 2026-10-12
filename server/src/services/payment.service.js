'use strict';

const { Op } = require('sequelize');

const {
  Payment,
  PaymentSchedule,
  Booking,
  OperatorConfirmation,
  Operator,
  User,
} = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const {
  addDecimal,
  subtractDecimal,
  sumDecimals,
  multiplyDecimal,
  compareDecimal,
  clampAtZero,
  isZero,
} = require('../utils/money');
const notificationService = require('./notification.service');

const SCHEDULE_SORTABLE = ['dueOn', 'sequence', 'amount', 'createdAt'];
const PAYMENT_SORTABLE = ['receivedOn', 'amount', 'status', 'createdAt'];

const PAYMENT_INCLUDE = [
  { model: PaymentSchedule, as: 'schedule', required: false },
  { model: User, as: 'recordedBy', required: false },
  {
    model: OperatorConfirmation,
    as: 'operatorConfirmation',
    required: false,
    include: [{ model: Operator, as: 'operator', required: false }],
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function boolish(value) {
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

// --- Schedules -------------------------------------------------------------

async function requireBooking(bookingId) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  return booking;
}

async function listSchedules(query = {}) {
  const options = parseListQuery(query, {
    sortable: SCHEDULE_SORTABLE,
    defaultSort: 'dueOn:asc',
  });

  const where = {};
  if (query.bookingId) where.bookingId = query.bookingId;
  if (query.status) where.status = query.status;
  if (boolish(query.liveOnly)) where.status = 'scheduled';

  const result = await PaymentSchedule.findAndCountAll({
    where,
    include: [
      { model: Booking, as: 'booking', required: false },
      { model: User, as: 'createdBy', required: false },
    ],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
  });

  const settlements = await settlementsFor(result.rows.map((row) => row.id));
  return paginated(result, options, (row) => row.toPublicJSON(settlements.get(String(row.id))));
}

async function getSchedule(id) {
  const schedule = await PaymentSchedule.findByPk(id, {
    include: [
      { model: Booking, as: 'booking', required: false },
      { model: User, as: 'createdBy', required: false },
    ],
  });
  if (!schedule) throw ApiError.notFound('Instalment not found.');
  return schedule;
}

async function addSchedule(payload, actingUser) {
  const booking = await requireBooking(payload.bookingId);
  if (booking.status === 'cancelled') {
    throw ApiError.badRequest('That booking is cancelled.', { code: 'BOOKING_CANCELLED' });
  }

  // Numbered in the order they were added unless told otherwise, so a plan
  // reads as a plan rather than a set of unordered dates.
  let sequence = payload.sequence;
  if (sequence === undefined || sequence === null) {
    const highest = await PaymentSchedule.max('sequence', {
      where: { bookingId: booking.id },
    });
    sequence = (Number.isFinite(highest) ? highest : 0) + 1;
  }

  const created = await PaymentSchedule.create({
    ...payload,
    sequence,
    currencyCode: payload.currencyCode || booking.currencyCode,
    createdByUserId: actingUser.id,
    updatedByUserId: actingUser.id,
  });

  return getSchedule(created.id);
}

async function updateSchedule(id, changes, actingUser) {
  const schedule = await getSchedule(id);

  if (!schedule.isLive()) {
    throw ApiError.badRequest(
      `This instalment is ${schedule.status} and can no longer be changed.`,
      { code: 'SCHEDULE_CLOSED' }
    );
  }

  // Reducing a plan below what has already been received would leave the
  // booking showing a credit it does not have. Refunding is a ledger entry, not
  // an edit to the plan.
  if (changes.amount !== undefined) {
    const settled = await settlementFor(schedule);
    if (compareDecimal(changes.amount, settled.paid) < 0) {
      throw ApiError.badRequest(
        `${settled.paid} has already been received against this instalment. Record a refund rather than reducing it below that.`,
        { code: 'SCHEDULE_BELOW_PAID', details: { amount: `Cannot be less than ${settled.paid}.` } }
      );
    }
  }

  await schedule.update({ ...changes, updatedByUserId: actingUser.id });
  return getSchedule(id);
}

/**
 * Write off an instalment, or drop it from the plan.
 *
 * Waiving needs a reason. Money a traveller owed and no longer does is the
 * single most sensitive thing anyone can do on this screen, and an unexplained
 * write-off is indistinguishable from a covered-up one.
 */
async function closeSchedule(id, { status, reason }, actingUser) {
  const schedule = await getSchedule(id);

  if (!schedule.isLive()) {
    throw ApiError.badRequest(`This instalment is already ${schedule.status}.`, {
      code: 'SCHEDULE_CLOSED',
    });
  }

  if (status === 'waived' && !reason) {
    throw ApiError.badRequest('Say why this instalment is being written off.', {
      code: 'VALIDATION_ERROR',
      details: { reason: 'Required when waiving.' },
    });
  }

  const settled = await settlementFor(schedule);
  if (status === 'cancelled' && !isZero(settled.paid)) {
    throw ApiError.badRequest(
      `${settled.paid} has been received against this instalment. Refund it or waive the remainder instead of cancelling.`,
      { code: 'SCHEDULE_HAS_PAYMENTS' }
    );
  }

  await schedule.update({
    status,
    waivedReason: reason || null,
    updatedByUserId: actingUser.id,
  });

  return getSchedule(id);
}

// --- What the ledger says about a plan -------------------------------------

/**
 * How much cleared money sits against each of these instalments.
 *
 * One query for the whole page rather than one per row — the finance screen
 * lists fifty instalments, and fifty round trips to answer "how much of this
 * one is paid" is how a reconciliation screen becomes the slowest page in the
 * product.
 *
 * Refunds subtract. A refunded payment is money that came in and went back out,
 * and an instalment it was applied to is owed again.
 */
async function settlementsFor(scheduleIds = []) {
  const ids = scheduleIds.map((id) => String(id));
  const map = new Map();
  if (ids.length === 0) return map;

  const rows = await PaymentSchedule.findAll({
    where: { id: { [Op.in]: ids } },
    include: [{ model: Payment, as: 'payments', required: false }],
  });

  for (const schedule of rows) {
    map.set(String(schedule.id), settle(schedule, schedule.payments || []));
  }
  return map;
}

async function settlementFor(schedule) {
  const payments = await Payment.findAll({ where: { paymentScheduleId: schedule.id } });
  return settle(schedule, payments);
}

function settle(schedule, payments) {
  const incoming = payments.filter((row) => row.direction === 'incoming');

  const cleared = incoming.filter((row) => row.status === 'cleared');
  const pending = incoming.filter((row) => row.status === 'pending');
  const refunded = incoming.filter((row) => row.status === 'refunded');

  const paid = sumDecimals(cleared.map((row) => row.amountInBase));
  const awaiting = sumDecimals(pending.map((row) => row.amountInBase));
  const returned = sumDecimals(refunded.map((row) => row.amountInBase));

  const expected = schedule.isLive() ? schedule.amount : '0.00';
  const outstanding = clampAtZero(subtractDecimal(expected, paid));

  return {
    paid,
    awaitingClearance: awaiting,
    refunded: returned,
    outstanding,
    settled: schedule.isLive() ? isZero(outstanding) : true,
    // Past its date *and* still owed. Either alone is not a reason to chase.
    overdue: schedule.isPastDue() && !isZero(outstanding),
  };
}

// --- Payments --------------------------------------------------------------

async function listPayments(query = {}) {
  const options = parseListQuery(query, {
    sortable: PAYMENT_SORTABLE,
    defaultSort: 'receivedOn:desc',
  });

  const where = {};
  if (query.bookingId) where.bookingId = query.bookingId;
  if (query.paymentScheduleId) where.paymentScheduleId = query.paymentScheduleId;
  if (query.direction) where.direction = query.direction;
  if (query.method) where.method = query.method;
  if (query.status) {
    where.status = String(query.status).includes(',')
      ? { [Op.in]: String(query.status).split(',') }
      : query.status;
  }
  if (query.from || query.to) {
    where.receivedOn = {};
    if (query.from) where.receivedOn[Op.gte] = query.from;
    if (query.to) where.receivedOn[Op.lte] = query.to;
  }
  if (query.q) {
    where.reference = { [Op.like]: `%${query.q}%` };
  }

  const result = await Payment.findAndCountAll({
    where,
    include: [...PAYMENT_INCLUDE, { model: Booking, as: 'booking', required: false }],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function getPayment(id) {
  const payment = await Payment.findByPk(id, {
    include: [...PAYMENT_INCLUDE, { model: Booking, as: 'booking', required: false }],
  });
  if (!payment) throw ApiError.notFound('Payment not found.');
  return payment;
}

/**
 * Record a movement of money.
 *
 * The conversion happens here, once. `amountInBase` and the rate that produced
 * it are both written to the row, and nothing recomputes them afterwards — see
 * the migration for why.
 */
async function recordPayment(payload, actingUser) {
  const booking = await requireBooking(payload.bookingId);

  const baseCurrencyCode = booking.currencyCode;
  const currencyCode = payload.currencyCode || baseCurrencyCode;

  // A rate is only meaningful between two different currencies. Supplying one
  // for a same-currency payment is a sign somebody has misunderstood the form,
  // and silently ignoring it would turn that misunderstanding into a wrong figure.
  if (currencyCode === baseCurrencyCode) {
    if (payload.exchangeRate !== undefined && compareDecimal(payload.exchangeRate, '1') !== 0) {
      throw ApiError.badRequest(
        `This payment is already in ${baseCurrencyCode}, so it needs no exchange rate.`,
        { code: 'UNEXPECTED_EXCHANGE_RATE', details: { exchangeRate: 'Leave blank.' } }
      );
    }
  } else if (payload.exchangeRate === undefined || payload.exchangeRate === null) {
    throw ApiError.badRequest(
      `Give the rate used to convert ${currencyCode} into ${baseCurrencyCode}. It is stored with the payment so this figure never changes.`,
      { code: 'EXCHANGE_RATE_REQUIRED', details: { exchangeRate: 'Required.' } }
    );
  }

  const exchangeRate = currencyCode === baseCurrencyCode ? '1' : String(payload.exchangeRate);
  const amountInBase = multiplyDecimal(payload.amount, exchangeRate);

  if (payload.paymentScheduleId) {
    const schedule = await PaymentSchedule.findOne({
      where: { id: payload.paymentScheduleId, bookingId: booking.id },
    });
    if (!schedule) {
      throw ApiError.badRequest('That instalment is not on this booking.', {
        code: 'INVALID_SCHEDULE',
        details: { paymentScheduleId: 'Not on this booking.' },
      });
    }
    if (payload.direction === 'outgoing') {
      throw ApiError.badRequest('An instalment is money coming in, not going out.', {
        code: 'DIRECTION_MISMATCH',
        details: { paymentScheduleId: 'Only applies to incoming payments.' },
      });
    }
  }

  if (payload.operatorConfirmationId) {
    const confirmation = await OperatorConfirmation.findOne({
      where: { id: payload.operatorConfirmationId, bookingId: booking.id },
    });
    if (!confirmation) {
      throw ApiError.badRequest('That operator confirmation is not on this booking.', {
        code: 'INVALID_CONFIRMATION',
        details: { operatorConfirmationId: 'Not on this booking.' },
      });
    }
    // Paying an operator who has not confirmed is how money leaves for a
    // service nobody agreed to provide.
    if (confirmation.status !== 'confirmed') {
      throw ApiError.badRequest(
        `That arrangement is "${confirmation.status}", not confirmed. Do not pay against it yet.`,
        { code: 'CONFIRMATION_NOT_CONFIRMED' }
      );
    }
  }

  if (payload.reference) {
    const duplicate = await Payment.findOne({
      where: { direction: payload.direction || 'incoming', reference: payload.reference },
    });
    if (duplicate) {
      throw ApiError.badRequest(
        `Reference "${payload.reference}" is already recorded against ${
          duplicate.bookingId === booking.id ? 'this booking' : 'another booking'
        }.`,
        { code: 'DUPLICATE_REFERENCE', details: { reference: 'Already recorded.' } }
      );
    }
  }

  const created = await Payment.create({
    ...payload,
    currencyCode,
    baseCurrencyCode,
    exchangeRate,
    amountInBase,
    receivedOn: payload.receivedOn || today(),
    clearedAt: payload.status === 'cleared' ? new Date() : null,
    recordedByUserId: actingUser.id,
    updatedByUserId: actingUser.id,
  });

  const fresh = await getPayment(created.id);
  if (fresh.status === 'cleared' && fresh.direction === 'incoming') {
    await notifyReceived(fresh, booking, actingUser);
  }
  return fresh;
}

/**
 * Correct the parts of a payment that are description rather than money.
 *
 * The amount, currency, rate and direction are not editable. A wrong amount is
 * corrected by failing the row and recording the right one, which leaves both
 * the error and the correction visible. Letting finance quietly rewrite a
 * figure would make the ledger unauditable, which is the one thing a ledger
 * cannot be.
 */
async function updatePayment(id, changes, actingUser) {
  const payment = await getPayment(id);

  if (changes.reference && changes.reference !== payment.reference) {
    const duplicate = await Payment.findOne({
      where: {
        direction: payment.direction,
        reference: changes.reference,
        id: { [Op.ne]: payment.id },
      },
    });
    if (duplicate) {
      throw ApiError.badRequest(`Reference "${changes.reference}" is already recorded.`, {
        code: 'DUPLICATE_REFERENCE',
        details: { reference: 'Already recorded.' },
      });
    }
  }

  await payment.update({ ...changes, updatedByUserId: actingUser.id });
  return getPayment(id);
}

/** Move a payment along: cleared, failed, refunded. */
async function settlePayment(id, { status, reason }, actingUser) {
  const payment = await getPayment(id);

  if (!Payment.canTransition(payment.status, status)) {
    throw ApiError.badRequest(
      `Cannot move a payment from "${payment.status}" to "${status}".`,
      {
        code: 'INVALID_STATUS_TRANSITION',
        details: { allowed: Payment.ALLOWED_TRANSITIONS[payment.status] },
      }
    );
  }

  if ((status === 'failed' || status === 'refunded') && !reason) {
    throw ApiError.badRequest(`Say why this payment was ${status}.`, {
      code: 'VALIDATION_ERROR',
      details: { reason: 'Required.' },
    });
  }

  await payment.update({
    status,
    clearedAt: status === 'cleared' ? new Date() : payment.clearedAt,
    settledReason: status === 'cleared' ? null : reason,
    updatedByUserId: actingUser.id,
  });

  const fresh = await getPayment(id);
  const booking = await Booking.findByPk(fresh.bookingId);

  if (fresh.direction === 'incoming') {
    if (status === 'cleared') await notifyReceived(fresh, booking, actingUser);
    if (status === 'failed') await notifyFailed(fresh, booking, actingUser);
  }

  return fresh;
}

// --- Reconciliation --------------------------------------------------------

/**
 * Everything about one booking's money, in one read.
 *
 * This is the screen the module exists for. The business case describes
 * payment tracking spread across a spreadsheet and the consultant's memory; the
 * figures below are the ones that currently take somebody twenty minutes and a
 * phone call to assemble.
 */
async function bookingSummary(bookingId) {
  const booking = await requireBooking(bookingId);

  const schedules = await PaymentSchedule.findAll({
    where: { bookingId },
    include: [{ model: Payment, as: 'payments', required: false }],
    order: [
      ['dueOn', 'ASC'],
      ['sequence', 'ASC'],
    ],
  });

  const payments = await Payment.findAll({
    where: { bookingId },
    include: PAYMENT_INCLUDE,
    order: [['receivedOn', 'DESC']],
  });

  const incoming = payments.filter((row) => row.direction === 'incoming');
  const outgoing = payments.filter((row) => row.direction === 'outgoing');

  const received = sumDecimals(
    incoming.filter((row) => row.status === 'cleared').map((row) => row.amountInBase)
  );
  const awaitingClearance = sumDecimals(
    incoming.filter((row) => row.status === 'pending').map((row) => row.amountInBase)
  );
  const refunded = sumDecimals(
    incoming.filter((row) => row.status === 'refunded').map((row) => row.amountInBase)
  );
  const paidOut = sumDecimals(
    outgoing.filter((row) => row.status === 'cleared').map((row) => row.amountInBase)
  );

  const live = schedules.filter((row) => row.isLive());
  const scheduled = sumDecimals(live.map((row) => row.amount));

  const settlements = new Map(
    schedules.map((row) => [String(row.id), settle(row, row.payments || [])])
  );
  const overdueAmount = sumDecimals(
    live
      .filter((row) => settlements.get(String(row.id)).overdue)
      .map((row) => settlements.get(String(row.id)).outstanding)
  );

  const nextDue = live
    .filter((row) => !settlements.get(String(row.id)).settled)
    .sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)))[0];

  const total = booking.totalAmount || '0.00';
  const balance = subtractDecimal(total, received);

  // The plan and the price should agree. When they do not, somebody changed one
  // and forgot the other — worth saying out loud rather than leaving for the
  // traveller to discover when the final invoice is short.
  const planMatchesTotal =
    booking.totalAmount === null || compareDecimal(scheduled, total) === 0;

  return {
    booking: {
      id: String(booking.id),
      reference: booking.reference,
      title: booking.title,
      status: booking.status,
      departureDate: booking.departureDate,
      currencyCode: booking.currencyCode,
      totalAmount: booking.totalAmount,
      depositAmount: booking.depositAmount,
    },
    currencyCode: booking.currencyCode,
    totals: {
      quoted: booking.totalAmount,
      scheduled,
      received,
      awaitingClearance,
      refunded,
      paidOut,
      balance,
      overdueAmount,
      // Quoted zero or unset is not "fully paid" — it is "not priced yet".
      fullyPaid:
        booking.totalAmount !== null &&
        !isZero(total) &&
        compareDecimal(received, total) >= 0,
      planMatchesTotal,
      planShortfall: planMatchesTotal ? '0.00' : subtractDecimal(total, scheduled),
    },
    nextDue: nextDue
      ? {
          ...nextDue.toPublicJSON(settlements.get(String(nextDue.id))),
        }
      : null,
    schedules: schedules.map((row) => row.toPublicJSON(settlements.get(String(row.id)))),
    payments: payments.map((row) => row.toPublicJSON()),
  };
}

/**
 * Every instalment still owed, soonest first — the chase list for finance.
 *
 * Cancelled bookings are excluded: nobody owes money on a trip that is not
 * happening, and leaving them in turns the list into something people scroll
 * past rather than work through.
 */
async function outstanding(query = {}) {
  const options = parseListQuery(query, {
    sortable: SCHEDULE_SORTABLE,
    defaultSort: 'dueOn:asc',
  });

  const where = { status: 'scheduled' };
  if (boolish(query.overdueOnly)) where.dueOn = { [Op.lt]: today() };
  if (query.bookingId) where.bookingId = query.bookingId;

  // Read a page's worth of candidates, then drop the ones the ledger says are
  // already settled. Filtering in SQL would mean summing the ledger inside the
  // WHERE clause, and getting refunds right there is not worth the query.
  const result = await PaymentSchedule.findAndCountAll({
    where,
    include: [
      {
        model: Booking,
        as: 'booking',
        required: true,
        where: { status: { [Op.notIn]: ['cancelled'] } },
      },
      { model: Payment, as: 'payments', required: false },
    ],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
    subQuery: false,
  });

  const rows = result.rows
    .map((row) => ({ row, settlement: settle(row, row.payments || []) }))
    .filter(({ settlement }) => !settlement.settled);

  return {
    data: rows.map(({ row, settlement }) => row.toPublicJSON(settlement)),
    meta: {
      page: options.page,
      perPage: options.perPage,
      total: result.count,
      totalPages: options.perPage > 0 ? Math.ceil(result.count / options.perPage) : 0,
      // Said plainly rather than left for the reader to infer from a short page:
      // the count above is instalments still open, some of which are paid.
      shownAfterSettlementFilter: rows.length,
    },
  };
}

/**
 * Figures for the finance dashboard.
 *
 * Money is grouped by currency and never added across them. An agency that
 * quotes in AUD and settles with operators in NPR has two sets of books, and a
 * single combined "total received" would be a number with no meaning — the kind
 * of figure that looks authoritative on a dashboard and is wrong.
 */
async function summary() {
  const schedules = await PaymentSchedule.findAll({
    where: { status: 'scheduled' },
    include: [
      {
        model: Booking,
        as: 'booking',
        required: true,
        where: { status: { [Op.notIn]: ['cancelled'] } },
      },
      { model: Payment, as: 'payments', required: false },
    ],
  });

  const open = schedules
    .map((row) => ({ row, settlement: settle(row, row.payments || []) }))
    .filter(({ settlement }) => !settlement.settled);

  const overdue = open.filter(({ settlement }) => settlement.overdue);
  const dueSoon = open.filter(({ row, settlement }) => {
    const days = row.daysUntilDue();
    return !settlement.overdue && days !== null && days <= 14;
  });

  const pendingCount = await Payment.count({ where: { status: 'pending' } });

  // Grouped by the currency each booking is quoted in.
  const byCurrency = new Map();
  for (const { row, settlement } of open) {
    const code = row.currencyCode || 'AUD';
    const bucket = byCurrency.get(code) || { currencyCode: code, outstanding: '0.00', overdue: '0.00' };
    bucket.outstanding = addDecimal(bucket.outstanding, settlement.outstanding);
    if (settlement.overdue) bucket.overdue = addDecimal(bucket.overdue, settlement.outstanding);
    byCurrency.set(code, bucket);
  }

  return {
    openInstalments: open.length,
    overdueInstalments: overdue.length,
    dueWithinFortnight: dueSoon.length,
    paymentsAwaitingClearance: pendingCount,
    outstandingByCurrency: [...byCurrency.values()].sort((a, b) =>
      a.currencyCode.localeCompare(b.currencyCode)
    ),
  };
}

// --- Notifications ---------------------------------------------------------

/**
 * Both of these are wrapped so a notification failure cannot undo a ledger
 * entry. The money is the fact; the bell is a convenience on top of it.
 */
async function notifyReceived(payment, booking, actor) {
  try {
    const recipients = await recipientsFor(booking);
    await notificationService.notify({
      recipients,
      actor,
      type: 'payment_received',
      severity: 'info',
      title: `Payment received — ${booking?.reference || 'booking'}`,
      body: `${payment.currencyCode} ${payment.amount}${
        payment.isConverted() ? ` (${payment.baseCurrencyCode} ${payment.amountInBase})` : ''
      }`,
      link: `/bookings/${payment.bookingId}`,
      dedupeKey: `payment_received:${payment.id}`,
    });
  } catch {
    // Intentionally swallowed. See the note above.
  }
}

async function notifyFailed(payment, booking, actor) {
  try {
    const recipients = await recipientsFor(booking);
    await notificationService.notify({
      recipients,
      actor,
      type: 'payment_failed',
      severity: 'warning',
      title: `Payment failed — ${booking?.reference || 'booking'}`,
      body: `${payment.currencyCode} ${payment.amount} — ${payment.settledReason || 'no reason recorded'}`,
      link: `/bookings/${payment.bookingId}`,
      dedupeKey: `payment_failed:${payment.id}`,
    });
  } catch {
    // Intentionally swallowed. See the note above.
  }
}

/**
 * Who hears about it: the people running this trip.
 *
 * The consultant and coordinator on the booking specifically, rather than every
 * trip editor in the office. A bell that lights up for forty people's payments
 * is a bell nobody reads.
 */
async function recipientsFor(booking) {
  if (!booking) return [];
  const ids = [booking.consultantId, booking.coordinatorId].filter(Boolean);
  if (ids.length === 0) return [];
  return User.findAll({ where: { id: { [Op.in]: ids }, isActive: true } });
}

/**
 * The trip owners, plus everyone in finance.
 *
 * Wider than `recipientsFor`: a payment landing or bouncing is news for the
 * consultant and coordinator specifically, but a chase is finance's job
 * whichever booking it is on — they are the audience `MONEY_RECORDERS` names
 * in `payment.routes.js`, and they have no per-booking assignment to read it
 * from.
 */
async function financeAndOwners(booking) {
  const [owners, finance] = await Promise.all([
    recipientsFor(booking),
    notificationService.staffWithRoles(['finance']),
  ]);
  const byId = new Map();
  for (const person of [...owners, ...finance]) {
    if (person) byId.set(String(person.id), person);
  }
  return [...byId.values()];
}

// --- Reminders ---------------------------------------------------------------

/**
 * Live, unsettled instalments in a date window, with the settlement already
 * computed — shared by both reminder passes below so "unsettled" means the
 * same thing in each.
 */
async function liveUnsettledSchedules(where) {
  const schedules = await PaymentSchedule.findAll({
    where: { status: 'scheduled', ...where },
    include: [
      {
        model: Booking,
        as: 'booking',
        required: true,
        // Nobody owes money on a trip that is not happening. Same exclusion
        // as `outstanding()`.
        where: { status: { [Op.notIn]: ['cancelled'] } },
      },
      { model: Payment, as: 'payments', required: false },
    ],
  });

  return schedules
    .map((schedule) => ({ schedule, settlement: settle(schedule, schedule.payments || []) }))
    .filter(({ settlement }) => !settlement.settled);
}

/**
 * The nudge before the date.
 *
 * Instalments due within `PAYMENT_REMINDER_LEAD_DAYS` and not yet paid off.
 * The dedupe key carries the due date, so an instalment that is rescheduled
 * re-enters the window as a new fact rather than staying silent because it
 * already sent one reminder against the old date.
 */
async function remindUpcomingPayments({ now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  horizon.setUTCDate(horizon.getUTCDate() + env.payments.reminderLeadDays);
  const horizonOn = horizon.toISOString().slice(0, 10);

  const open = await liveUnsettledSchedules({ dueOn: { [Op.gte]: today, [Op.lte]: horizonOn } });

  let raised = 0;
  for (const { schedule, settlement } of open) {
    // eslint-disable-next-line no-await-in-loop
    const recipients = await financeAndOwners(schedule.booking);
    // eslint-disable-next-line no-await-in-loop
    const result = await notificationService.notify({
      recipients,
      type: 'payment_due_soon',
      severity: 'info',
      title: `Instalment due soon — ${schedule.booking.reference}`,
      body: `${schedule.label}: ${schedule.currencyCode} ${settlement.outstanding} due ${schedule.dueOn}.`,
      link: `/bookings/${schedule.bookingId}`,
      dedupeKey: `payment_schedule:${schedule.id}:due_soon:${schedule.dueOn}`,
    });
    raised += result.created;
  }

  return { checked: open.length, notified: raised };
}

/**
 * The nudge after the date.
 *
 * Same shape as `notifyOverdueTasks` in `notification.service.js`: run from
 * the scheduled sweep, not computed when somebody opens the bell, so an
 * instalment overdue for a fortnight raises one notification rather than
 * fourteen — the dedupe key holds it at that until the due date itself
 * changes.
 */
async function remindOverduePayments({ now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);

  const open = await liveUnsettledSchedules({ dueOn: { [Op.lt]: today } });

  let raised = 0;
  for (const { schedule, settlement } of open) {
    // eslint-disable-next-line no-await-in-loop
    const recipients = await financeAndOwners(schedule.booking);
    // eslint-disable-next-line no-await-in-loop
    const result = await notificationService.notify({
      recipients,
      type: 'payment_overdue',
      severity: 'warning',
      title: `Instalment overdue — ${schedule.booking.reference}`,
      body: `${schedule.label}: ${schedule.currencyCode} ${settlement.outstanding} was due ${schedule.dueOn}.`,
      link: `/bookings/${schedule.bookingId}`,
      dedupeKey: `payment_schedule:${schedule.id}:overdue:${schedule.dueOn}`,
    });
    raised += result.created;
  }

  return { checked: open.length, notified: raised };
}

module.exports = {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  closeSchedule,

  listPayments,
  getPayment,
  recordPayment,
  updatePayment,
  settlePayment,

  bookingSummary,
  outstanding,
  summary,

  remindUpcomingPayments,
  remindOverduePayments,

  // Exported for the tests, which assert on the settlement rules directly.
  settle,
};
