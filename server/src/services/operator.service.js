'use strict';

const { Op, fn, col } = require('sequelize');

const {
  Operator,
  OperatorConfirmation,
  Destination,
  Booking,
  ItinerarySegment,
  TravellerDocument,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const notificationService = require('./notification.service');

const OPERATOR_SORTABLE = ['name', 'createdAt', 'type'];
const CONFIRMATION_SORTABLE = ['dueBy', 'createdAt', 'status', 'serviceType'];

const CONFIRMATION_INCLUDE = [
  { model: Operator, as: 'operator', required: false },
  { model: ItinerarySegment, as: 'segment', required: false },
  { model: User, as: 'createdBy', required: false },
];

// --- Operators -------------------------------------------------------------

async function list(query) {
  const options = parseListQuery(query, {
    sortable: OPERATOR_SORTABLE,
    defaultSort: 'name:asc',
  });
  const where = {};

  if (query.destinationId) where.destinationId = query.destinationId;
  if (query.type) where.type = query.type;
  if (query.isActive !== undefined && query.isActive !== '') {
    where.isActive = ['1', 'true', 'yes'].includes(String(query.isActive).toLowerCase());
  }
  if (query.vetted !== undefined && query.vetted !== '') {
    const wantVetted = ['1', 'true', 'yes'].includes(String(query.vetted).toLowerCase());
    where.vettedAt = wantVetted ? { [Op.ne]: null } : null;
  }
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { contactName: { [Op.like]: term } },
      { contactEmail: { [Op.like]: term } },
    ];
  }

  const result = await Operator.findAndCountAll({
    where,
    include: [{ model: Destination, as: 'destination', required: false }],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function getById(id, { withStats = false } = {}) {
  const operator = await Operator.findByPk(id, {
    include: [
      { model: Destination, as: 'destination', required: false },
      { model: User, as: 'vettedBy', required: false },
    ],
  });
  if (!operator) throw ApiError.notFound('Operator not found.');

  if (withStats) operator.stats = await performance(operator.id);
  return operator;
}

async function create(payload, actingUser) {
  const destination = await Destination.findByPk(payload.destinationId);
  if (!destination) {
    throw ApiError.badRequest('That destination does not exist.', {
      code: 'INVALID_DESTINATION',
      details: { destinationId: 'Not found.' },
    });
  }

  const clash = await Operator.findOne({
    where: { destinationId: payload.destinationId, name: payload.name },
  });
  if (clash) {
    throw ApiError.badRequest('An operator with that name already exists for this destination.', {
      code: 'OPERATOR_EXISTS',
      details: { name: 'Already in use for this destination.' },
    });
  }

  const created = await Operator.create({ ...payload, createdByUserId: actingUser.id });
  return getById(created.id);
}

async function update(id, changes) {
  const operator = await getById(id);

  if (changes.name && changes.name !== operator.name) {
    const clash = await Operator.findOne({
      where: {
        destinationId: changes.destinationId || operator.destinationId,
        name: changes.name,
        id: { [Op.ne]: operator.id },
      },
    });
    if (clash) {
      throw ApiError.badRequest('An operator with that name already exists for this destination.', {
        code: 'OPERATOR_EXISTS',
        details: { name: 'Already in use for this destination.' },
      });
    }
  }

  await operator.update(changes);
  return getById(id);
}

/**
 * Record that someone has checked this operator out.
 *
 * Vetting is what the agency's partner network is actually worth — Section 2.4
 * identifies it as the barrier to entry a competitor cannot quickly copy. So it
 * is stamped with a person and a date, and `unvet` exists because a partner who
 * stops meeting the standard has to be demotable without deleting the history
 * of trips they ran.
 */
async function setVetting(id, { vetted, notes }, actingUser) {
  const operator = await getById(id);

  await operator.update(
    vetted
      ? {
          vettedAt: new Date(),
          vettedByUserId: actingUser.id,
          vettingNotes: notes !== undefined ? notes : operator.vettingNotes,
        }
      : {
          vettedAt: null,
          vettedByUserId: null,
          vettingNotes: notes !== undefined ? notes : operator.vettingNotes,
        }
  );

  return getById(id);
}

/** Retired, not deleted — past confirmations reference them. */
async function deactivate(id) {
  const operator = await getById(id);

  const openWork = await OperatorConfirmation.count({
    where: { operatorId: operator.id, status: { [Op.in]: OperatorConfirmation.OPEN_STATUSES } },
  });
  if (openWork > 0) {
    throw ApiError.badRequest(
      `This operator has ${openWork} confirmation(s) still outstanding. Resolve or cancel them first.`,
      { code: 'OPERATOR_HAS_OPEN_WORK' }
    );
  }

  await operator.update({ isActive: false });
  return getById(id);
}

async function reactivate(id) {
  const operator = await getById(id);
  await operator.update({ isActive: true });
  return getById(id);
}

/**
 * How this operator actually performs.
 *
 * The agency's stated strength is its partner relationships, but nothing in the
 * current process tells anyone which partners are reliable — that judgement
 * lives in a consultant's head and leaves when they do. These are the figures
 * that make it transferable.
 */
async function performance(operatorId) {
  const rows = await OperatorConfirmation.findAll({
    where: { operatorId },
    attributes: ['status', 'requestedAt', 'respondedAt', 'dueBy'],
  });

  const total = rows.length;
  const answered = rows.filter((row) => row.respondedAt);
  const responseTimes = answered
    .map((row) => row.responseDays())
    .filter((days) => days !== null);

  const confirmed = rows.filter((row) => row.status === 'confirmed').length;
  const declined = rows.filter((row) => row.status === 'declined').length;
  const outstanding = rows.filter((row) => row.isOpen()).length;
  const overdue = rows.filter((row) => row.isOverdue()).length;

  return {
    total,
    confirmed,
    declined,
    outstanding,
    overdue,
    // Of the requests they answered, how many were yes. Deliberately not
    // confirmed/total — an operator should not look unreliable merely because
    // requests are still in flight.
    confirmationRate: answered.length > 0 ? Math.round((confirmed / answered.length) * 100) : null,
    averageResponseDays:
      responseTimes.length > 0
        ? Math.round(
            (responseTimes.reduce((sum, days) => sum + days, 0) / responseTimes.length) * 10
          ) / 10
        : null,
  };
}

// --- Confirmations ---------------------------------------------------------

async function listConfirmations(query) {
  const options = parseListQuery(query, {
    sortable: CONFIRMATION_SORTABLE,
    defaultSort: 'dueBy:asc',
  });
  const where = {};

  if (query.bookingId) where.bookingId = query.bookingId;
  if (query.operatorId) where.operatorId = query.operatorId;
  if (query.serviceType) where.serviceType = query.serviceType;
  if (query.status) {
    where.status = String(query.status).includes(',')
      ? { [Op.in]: String(query.status).split(',') }
      : query.status;
  }
  if (['1', 'true', 'yes'].includes(String(query.openOnly).toLowerCase())) {
    where.status = { [Op.in]: OperatorConfirmation.OPEN_STATUSES };
  }

  const result = await OperatorConfirmation.findAndCountAll({
    where,
    include: [...CONFIRMATION_INCLUDE, { model: Booking, as: 'booking', required: false }],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function getConfirmation(id) {
  const confirmation = await OperatorConfirmation.findByPk(id, {
    include: [
      ...CONFIRMATION_INCLUDE,
      { model: Booking, as: 'booking', required: false },
      { model: TravellerDocument, as: 'documents', required: false },
    ],
  });
  if (!confirmation) throw ApiError.notFound('Confirmation not found.');
  return confirmation;
}

async function addConfirmation(payload, actingUser) {
  const booking = await Booking.findByPk(payload.bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');
  if (booking.status === 'cancelled') {
    throw ApiError.badRequest('That booking is cancelled.', { code: 'BOOKING_CANCELLED' });
  }

  const operator = await Operator.findByPk(payload.operatorId);
  if (!operator) {
    throw ApiError.badRequest('That operator does not exist.', {
      code: 'INVALID_OPERATOR',
      details: { operatorId: 'Not found.' },
    });
  }
  if (!operator.isActive) {
    throw ApiError.badRequest('That operator has been retired.', {
      code: 'OPERATOR_INACTIVE',
      details: { operatorId: 'Retired.' },
    });
  }
  // Vetting is the agency's own control on who it puts travellers in front of.
  // Enforced here rather than left to the consultant's memory.
  if (!operator.isVetted()) {
    throw ApiError.badRequest(
      `${operator.name} has not been vetted. A coordinator must vet them before they can be given work.`,
      { code: 'OPERATOR_NOT_VETTED', details: { operatorId: 'Not vetted.' } }
    );
  }

  if (payload.itinerarySegmentId) {
    const segment = await ItinerarySegment.findOne({
      where: { id: payload.itinerarySegmentId, bookingId: payload.bookingId },
    });
    if (!segment) {
      throw ApiError.badRequest('That itinerary segment is not part of this booking.', {
        code: 'INVALID_SEGMENT',
        details: { itinerarySegmentId: 'Not on this booking.' },
      });
    }
  }

  // Default the deadline to the operator's usual turnaround, doubled, before
  // departure — so a slow partner is chased early rather than discovered late.
  let dueBy = payload.dueBy || null;
  if (!dueBy && booking.departureDate) {
    const lead = Math.max(operator.typicalResponseDays * 2, 7);
    const date = new Date(`${booking.departureDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - lead);
    dueBy = date.toISOString().slice(0, 10);
  }

  const created = await OperatorConfirmation.create({
    ...payload,
    dueBy,
    createdByUserId: actingUser.id,
    updatedByUserId: actingUser.id,
  });

  return getConfirmation(created.id);
}

async function updateConfirmation(id, changes, actingUser) {
  const confirmation = await getConfirmation(id);

  if (!confirmation.isOpen() && changes.status === undefined) {
    // Details can still be corrected on a closed record, but not silently — the
    // amount and reference are what finance reconciles against.
    const editable = ['operatorReference', 'amount', 'currencyCode', 'details'];
    const attempted = Object.keys(changes);
    const disallowed = attempted.filter((field) => !editable.includes(field));
    if (disallowed.length > 0) {
      throw ApiError.badRequest(
        `This confirmation is ${confirmation.status}. Only ${editable.join(', ')} can be corrected.`,
        { code: 'CONFIRMATION_CLOSED', details: { disallowed } }
      );
    }
  }

  await confirmation.update({ ...changes, updatedByUserId: actingUser.id });
  return getConfirmation(id);
}

/** Mark that the request has actually gone out. */
async function markRequested(id, actingUser) {
  const confirmation = await getConfirmation(id);

  if (!OperatorConfirmation.canTransition(confirmation.status, 'requested')) {
    throw ApiError.badRequest(
      `Cannot move a confirmation from "${confirmation.status}" to "requested".`,
      {
        code: 'INVALID_STATUS_TRANSITION',
        details: { allowed: OperatorConfirmation.ALLOWED_TRANSITIONS[confirmation.status] },
      }
    );
  }

  await confirmation.update({
    status: 'requested',
    requestedAt: new Date(),
    updatedByUserId: actingUser.id,
  });

  const fresh = await getConfirmation(id);
  await notificationService.operatorConfirmationRequested(fresh, fresh.operator, actingUser);
  return fresh;
}

/**
 * Record the operator's answer.
 *
 * A decline notifies the trip editors rather than sitting in the record waiting
 * to be noticed. An operator pulling out of a confirmed arrangement is the
 * scenario this whole module exists to surface early.
 *
 * `actingUser` is `null` when an operator records their own answer through
 * their own portal — they are not a `User` and cannot be. Staff callers
 * always pass a real one.
 */
async function respond(id, { confirmed, operatorReference, amount, currencyCode, reason }, actingUser) {
  const confirmation = await getConfirmation(id);
  const target = confirmed ? 'confirmed' : 'declined';

  if (!OperatorConfirmation.canTransition(confirmation.status, target)) {
    throw ApiError.badRequest(
      `Cannot move a confirmation from "${confirmation.status}" to "${target}".`,
      {
        code: 'INVALID_STATUS_TRANSITION',
        details: { allowed: OperatorConfirmation.ALLOWED_TRANSITIONS[confirmation.status] },
      }
    );
  }

  if (!confirmed && !reason) {
    throw ApiError.badRequest('Record why the operator declined.', {
      code: 'VALIDATION_ERROR',
      details: { reason: 'Required when declining.' },
    });
  }

  await confirmation.update({
    status: target,
    respondedAt: new Date(),
    // An answer with no recorded send is still an answer; stamp the request
    // time so response statistics are not silently skipped.
    requestedAt: confirmation.requestedAt || new Date(),
    operatorReference:
      operatorReference !== undefined ? operatorReference : confirmation.operatorReference,
    amount: amount !== undefined ? amount : confirmation.amount,
    currencyCode: currencyCode || confirmation.currencyCode,
    declineReason: confirmed ? null : reason,
    updatedByUserId: actingUser ? actingUser.id : null,
  });

  const fresh = await getConfirmation(id);

  if (!confirmed) {
    await notifyDeclined(fresh, actingUser);
  }

  return fresh;
}

async function cancelConfirmation(id, actingUser) {
  const confirmation = await getConfirmation(id);

  if (confirmation.status === 'cancelled') {
    throw ApiError.badRequest('This confirmation is already cancelled.', {
      code: 'ALREADY_CANCELLED',
    });
  }

  await confirmation.update({ status: 'cancelled', updatedByUserId: actingUser.id });
  return getConfirmation(id);
}

async function notifyDeclined(confirmation, actor) {
  try {
    const recipients = await notificationService.staffWithRoles(
      notificationService.TRIP_EDITOR_ROLES
    );
    await notificationService.notify({
      recipients,
      actor,
      type: 'operator_declined',
      severity: 'warning',
      title: `${confirmation.operator?.name || 'An operator'} declined`,
      body: `${confirmation.summary} — ${confirmation.booking?.reference || 'booking'}`,
      link: confirmation.bookingId ? `/bookings/${confirmation.bookingId}` : '/operators',
      dedupeKey: `operator_declined:${confirmation.id}`,
    });
  } catch {
    // A notification failure must not undo a recorded response. The decline is
    // the fact that matters; the alert is a convenience on top of it.
  }
}

// --- Booking-level view ----------------------------------------------------

/**
 * Operator readiness for one booking — the counterpart to document readiness.
 *
 * A party can have every passport and policy in order and still have nowhere to
 * sleep in Namche. This answers the other half of "is this trip actually ready".
 */
async function bookingReadiness(bookingId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: ItinerarySegment, as: 'segments', required: false }],
  });
  if (!booking) throw ApiError.notFound('Booking not found.');

  const confirmations = await OperatorConfirmation.findAll({
    where: { bookingId },
    // Documents too, here specifically — this is the one screen meant to answer
    // "is this trip ready" by tying operator and document readiness together,
    // so a permit confirmation showing a verified document attached (or none at
    // all) belongs on it. The plain confirmations list/outstanding-queue
    // endpoints don't need the extra join.
    include: [...CONFIRMATION_INCLUDE, { model: TravellerDocument, as: 'documents', required: false }],
    order: [['dueBy', 'ASC']],
  });

  const live = confirmations.filter((row) => row.status !== 'cancelled');
  const confirmed = live.filter((row) => row.status === 'confirmed');
  const declined = live.filter((row) => row.status === 'declined');
  const outstanding = live.filter((row) => row.isOpen());
  const overdue = live.filter((row) => row.isOverdue());

  // A segment with no live arrangement at all is the gap most worth naming: it
  // is invisible in a list of confirmations, because there is nothing to list.
  const coveredSegmentIds = new Set(
    live
      .filter((row) => row.itinerarySegmentId && row.status !== 'declined')
      .map((row) => String(row.itinerarySegmentId))
  );
  const uncoveredSegments = (booking.segments || [])
    .filter((segment) => !coveredSegmentIds.has(String(segment.id)))
    .map((segment) => ({
      id: String(segment.id),
      sequence: segment.sequence,
      title: segment.title,
    }));

  return {
    booking: {
      id: String(booking.id),
      reference: booking.reference,
      title: booking.title,
      status: booking.status,
      departureDate: booking.departureDate,
    },
    summary: {
      total: live.length,
      confirmed: confirmed.length,
      declined: declined.length,
      outstanding: outstanding.length,
      overdue: overdue.length,
      uncoveredSegments: uncoveredSegments.length,
      ready: live.length > 0 && outstanding.length === 0 && declined.length === 0,
    },
    uncoveredSegments,
    confirmations: live.map((row) => row.toPublicJSON()),
  };
}

/**
 * Everything still waiting on an answer, soonest deadline first.
 *
 * The chase list. Today this question can only be answered by asking each
 * consultant what they are waiting on, which is precisely the friction Section
 * 2.1 describes.
 */
async function outstanding(query = {}) {
  const options = parseListQuery(query, {
    sortable: CONFIRMATION_SORTABLE,
    defaultSort: 'dueBy:asc',
  });

  const where = { status: { [Op.in]: OperatorConfirmation.OPEN_STATUSES } };
  if (['1', 'true', 'yes'].includes(String(query.overdueOnly).toLowerCase())) {
    where.dueBy = { [Op.lt]: new Date().toISOString().slice(0, 10) };
  }

  const result = await OperatorConfirmation.findAndCountAll({
    where,
    include: [
      ...CONFIRMATION_INCLUDE,
      {
        model: Booking,
        as: 'booking',
        required: true,
        // A cancelled booking's outstanding requests are noise, not work.
        where: { status: { [Op.notIn]: ['cancelled', 'completed'] } },
      },
    ],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
    subQuery: false,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

/** Counts for the dashboard tile. */
async function summary() {
  const rows = await OperatorConfirmation.findAll({
    where: { status: { [Op.in]: OperatorConfirmation.OPEN_STATUSES } },
    include: [
      {
        model: Booking,
        as: 'booking',
        required: true,
        where: { status: { [Op.notIn]: ['cancelled', 'completed'] } },
        attributes: [],
      },
    ],
    attributes: ['id', 'status', 'dueBy'],
  });

  const activeOperators = await Operator.count({ where: { isActive: true } });
  const unvetted = await Operator.count({
    where: { isActive: true, vettedAt: null },
  });

  return {
    outstanding: rows.length,
    overdue: rows.filter((row) => row.isOverdue()).length,
    notYetRequested: rows.filter((row) => row.status === 'pending').length,
    activeOperators,
    unvettedOperators: unvetted,
  };
}

module.exports = {
  list,
  getById,
  create,
  update,
  setVetting,
  deactivate,
  reactivate,
  performance,

  listConfirmations,
  getConfirmation,
  addConfirmation,
  updateConfirmation,
  markRequested,
  respond,
  cancelConfirmation,

  bookingReadiness,
  outstanding,
  summary,
};
