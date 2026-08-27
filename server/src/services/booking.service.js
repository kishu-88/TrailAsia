'use strict';

const { Op } = require('sequelize');

const {
  Booking,
  BookingTraveller,
  ItinerarySegment,
  Traveller,
  Destination,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const travellerService = require('./traveller.service');

const SORTABLE = ['createdAt', 'departureDate', 'reference', 'status', 'title'];

const DETAIL_INCLUDE = [
  { model: User, as: 'consultant', required: false },
  { model: User, as: 'coordinator', required: false },
  { model: Traveller, as: 'leadTraveller', required: false },
  { model: Traveller, as: 'travellers', required: false, through: { attributes: ['isLead'] } },
  {
    model: ItinerarySegment,
    as: 'segments',
    required: false,
    include: [{ model: Destination, as: 'destination', required: false }],
  },
];

/**
 * Booking references look like TA-2026-0007.
 *
 * Generated from a count inside the transaction. Two consultants creating a
 * booking in the same instant could collide on the unique index, so the caller
 * retries — cheap, and far simpler than a separate sequence table.
 */
async function nextReference(transaction) {
  const year = new Date().getFullYear();
  const count = await Booking.count({
    where: { reference: { [Op.like]: `TA-${year}-%` } },
    transaction,
  });
  return `TA-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function list(query) {
  const options = parseListQuery(query, {
    sortable: SORTABLE,
    defaultSort: 'departureDate:asc',
  });
  const where = {};

  if (query.status) {
    where.status = String(query.status).includes(',')
      ? { [Op.in]: String(query.status).split(',') }
      : query.status;
  }
  if (query.consultantId) where.consultantId = query.consultantId;
  if (query.coordinatorId) where.coordinatorId = query.coordinatorId;
  if (query.departingAfter) where.departureDate = { [Op.gte]: query.departingAfter };
  if (query.departingBefore) {
    where.departureDate = { ...(where.departureDate || {}), [Op.lte]: query.departingBefore };
  }
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [{ title: { [Op.like]: term } }, { reference: { [Op.like]: term } }];
  }

  const include = [
    { model: User, as: 'consultant', required: false },
    { model: Traveller, as: 'leadTraveller', required: false },
  ];

  // Filtering by destination means joining through the itinerary.
  if (query.destinationId) {
    include.push({
      model: ItinerarySegment,
      as: 'segments',
      required: true,
      where: { destinationId: query.destinationId },
      attributes: [],
    });
  }

  const result = await Booking.findAndCountAll({
    where,
    include,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
    subQuery: false,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function getById(id, { detailed = true } = {}) {
  const booking = await Booking.findByPk(id, {
    include: detailed ? DETAIL_INCLUDE : [],
    order: detailed ? [[{ model: ItinerarySegment, as: 'segments' }, 'sequence', 'ASC']] : undefined,
  });
  if (!booking) throw ApiError.notFound('Booking not found.');
  return booking;
}

async function assertUserExists(id, label, role = null) {
  if (id === undefined || id === null) return;
  const user = await User.findByPk(id);
  if (!user || !user.isActive) {
    throw ApiError.badRequest(`The ${label} must be an active staff account.`, {
      code: 'INVALID_STAFF_REFERENCE',
      details: { [label]: 'Not found or inactive.' },
    });
  }
  if (role && user.role !== role && user.role !== 'admin') {
    throw ApiError.badRequest(`That account is not a ${role}.`, {
      code: 'INVALID_STAFF_ROLE',
    });
  }
}

async function create(payload, actingUser) {
  const consultantId = payload.consultantId || actingUser.id;
  await assertUserExists(consultantId, 'consultantId');
  await assertUserExists(payload.coordinatorId, 'coordinatorId');

  // Retry once on the (unlikely) reference collision.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const booking = await sequelize.transaction(async (transaction) => {
        const reference = await nextReference(transaction);
        const created = await Booking.create(
          {
            ...payload,
            reference,
            consultantId,
            createdByUserId: actingUser.id,
          },
          { transaction }
        );

        if (payload.travellerIds && payload.travellerIds.length > 0) {
          await attachTravellers(created, payload.travellerIds, transaction);
        }
        return created;
      });
      return getById(booking.id);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError' && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error('Could not allocate a booking reference.');
}

async function attachTravellers(booking, travellerIds, transaction) {
  const travellers = await Traveller.findAll({
    where: { id: { [Op.in]: travellerIds } },
    transaction,
  });
  if (travellers.length !== travellerIds.length) {
    throw ApiError.badRequest('One or more travellers could not be found.', {
      code: 'INVALID_TRAVELLER',
    });
  }
  await BookingTraveller.bulkCreate(
    travellers.map((traveller) => ({
      bookingId: booking.id,
      travellerId: traveller.id,
      isLead: String(traveller.id) === String(booking.leadTravellerId),
    })),
    { transaction, ignoreDuplicates: true }
  );
}

async function update(id, changes) {
  const booking = await getById(id, { detailed: false });

  if (booking.status === 'cancelled') {
    throw ApiError.badRequest('A cancelled booking cannot be edited.', {
      code: 'BOOKING_CANCELLED',
    });
  }
  if (booking.status === 'completed' && changes.status !== undefined) {
    throw ApiError.badRequest('A completed booking cannot change status.', {
      code: 'BOOKING_COMPLETED',
    });
  }

  if (changes.status && !Booking.canTransition(booking.status, changes.status)) {
    throw ApiError.badRequest(
      `Cannot move a booking from "${booking.status}" to "${changes.status}".`,
      {
        code: 'INVALID_STATUS_TRANSITION',
        details: { allowed: Booking.ALLOWED_TRANSITIONS[booking.status] },
      }
    );
  }

  if (changes.consultantId) await assertUserExists(changes.consultantId, 'consultantId');
  if (changes.coordinatorId) await assertUserExists(changes.coordinatorId, 'coordinatorId');

  // Cancellation goes through cancel(), which records why.
  delete changes.cancelledAt;
  if (changes.status === 'cancelled') {
    throw ApiError.badRequest('Use POST /bookings/:id/cancel to cancel a booking.', {
      code: 'USE_CANCEL_ENDPOINT',
    });
  }

  await booking.update(changes);
  return getById(id);
}

async function cancel(id, reason) {
  const booking = await getById(id, { detailed: false });
  if (booking.status === 'cancelled') {
    throw ApiError.badRequest('This booking is already cancelled.', {
      code: 'ALREADY_CANCELLED',
    });
  }
  if (booking.status === 'completed') {
    throw ApiError.badRequest('A completed booking cannot be cancelled.', {
      code: 'BOOKING_COMPLETED',
    });
  }
  await booking.update({
    status: 'cancelled',
    cancelledAt: new Date(),
    cancellationReason: reason,
  });
  return getById(id);
}

// --- Party -----------------------------------------------------------------

async function addTraveller(bookingId, travellerId, { isLead = false, notes } = {}) {
  const booking = await getById(bookingId, { detailed: false });
  const traveller = await Traveller.findByPk(travellerId);
  if (!traveller) throw ApiError.notFound('Traveller not found.');

  const existing = await BookingTraveller.findOne({ where: { bookingId, travellerId } });
  if (existing) {
    throw ApiError.badRequest('That traveller is already on this booking.', {
      code: 'TRAVELLER_ALREADY_ON_BOOKING',
    });
  }

  await sequelize.transaction(async (transaction) => {
    if (isLead) {
      await BookingTraveller.update(
        { isLead: false },
        { where: { bookingId }, transaction }
      );
      await booking.update({ leadTravellerId: travellerId }, { transaction });
    }
    await BookingTraveller.create({ bookingId, travellerId, isLead, notes }, { transaction });
  });

  return getById(bookingId);
}

async function removeTraveller(bookingId, travellerId) {
  const booking = await getById(bookingId, { detailed: false });
  const link = await BookingTraveller.findOne({ where: { bookingId, travellerId } });
  if (!link) throw ApiError.notFound('That traveller is not on this booking.');

  await sequelize.transaction(async (transaction) => {
    await link.destroy({ transaction });
    if (String(booking.leadTravellerId) === String(travellerId)) {
      await booking.update({ leadTravellerId: null }, { transaction });
    }
  });

  return getById(bookingId);
}

// --- Itinerary -------------------------------------------------------------

async function listSegments(bookingId) {
  await getById(bookingId, { detailed: false });
  return ItinerarySegment.findAll({
    where: { bookingId },
    include: [{ model: Destination, as: 'destination', required: false }],
    order: [['sequence', 'ASC']],
  });
}

async function addSegment(bookingId, payload) {
  await getById(bookingId, { detailed: false });

  const destination = await Destination.findByPk(payload.destinationId);
  if (!destination) {
    throw ApiError.badRequest('That destination does not exist.', {
      code: 'INVALID_DESTINATION',
      details: { destinationId: 'Not found.' },
    });
  }

  const sequence =
    payload.sequence !== undefined
      ? payload.sequence
      : ((await ItinerarySegment.max('sequence', { where: { bookingId } })) || 0) + 1;

  const clash = await ItinerarySegment.findOne({ where: { bookingId, sequence } });
  if (clash) {
    throw ApiError.badRequest(`Position ${sequence} is already taken in this itinerary.`, {
      code: 'SEQUENCE_IN_USE',
    });
  }

  const created = await ItinerarySegment.create({ ...payload, bookingId, sequence });
  return ItinerarySegment.findByPk(created.id, {
    include: [{ model: Destination, as: 'destination' }],
  });
}

async function getSegment(id) {
  const segment = await ItinerarySegment.findByPk(id, {
    include: [{ model: Destination, as: 'destination', required: false }],
  });
  if (!segment) throw ApiError.notFound('Itinerary segment not found.');
  return segment;
}

async function updateSegment(id, changes) {
  const segment = await getSegment(id);
  if (changes.destinationId) {
    const destination = await Destination.findByPk(changes.destinationId);
    if (!destination) {
      throw ApiError.badRequest('That destination does not exist.', {
        code: 'INVALID_DESTINATION',
      });
    }
  }
  if (changes.sequence !== undefined && changes.sequence !== segment.sequence) {
    const clash = await ItinerarySegment.findOne({
      where: {
        bookingId: segment.bookingId,
        sequence: changes.sequence,
        id: { [Op.ne]: segment.id },
      },
    });
    if (clash) {
      throw ApiError.badRequest(
        `Position ${changes.sequence} is already taken. Use the reorder endpoint to move segments around.`,
        { code: 'SEQUENCE_IN_USE' }
      );
    }
  }
  await segment.update(changes);
  return getSegment(id);
}

async function deleteSegment(id) {
  const segment = await getSegment(id);
  await segment.destroy();
}

/**
 * Renumber the whole itinerary from an ordered list of segment ids.
 *
 * Done in two passes inside one transaction: everything is moved to a temporary
 * high range first, because assigning final positions directly would trip the
 * unique (booking, sequence) index halfway through.
 */
async function reorderSegments(bookingId, orderedIds) {
  await getById(bookingId, { detailed: false });

  const segments = await ItinerarySegment.findAll({ where: { bookingId } });
  if (segments.length !== orderedIds.length) {
    throw ApiError.badRequest(
      'The reorder list must contain every segment in this itinerary exactly once.',
      { code: 'INCOMPLETE_REORDER', details: { expected: segments.length, received: orderedIds.length } }
    );
  }

  const known = new Set(segments.map((segment) => String(segment.id)));
  for (const id of orderedIds) {
    if (!known.has(String(id))) {
      throw ApiError.badRequest(`Segment ${id} is not part of this itinerary.`, {
        code: 'UNKNOWN_SEGMENT',
      });
    }
  }

  await sequelize.transaction(async (transaction) => {
    const offset = 1000;
    for (let index = 0; index < orderedIds.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await ItinerarySegment.update(
        { sequence: offset + index },
        { where: { id: orderedIds[index], bookingId }, transaction }
      );
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await ItinerarySegment.update(
        { sequence: index + 1 },
        { where: { id: orderedIds[index], bookingId }, transaction }
      );
    }
  });

  return listSegments(bookingId);
}

// --- Readiness -------------------------------------------------------------

/**
 * Document readiness for everyone on a booking, against every destination the
 * itinerary actually visits.
 *
 * This is the report a coordinator wants fourteen days out: one call, one
 * answer, instead of cross-referencing a party list against a requirements
 * sheet by hand.
 */
async function readiness(bookingId) {
  const booking = await getById(bookingId);

  const destinationIds = [
    ...new Set((booking.segments || []).map((segment) => String(segment.destinationId))),
  ];

  if (destinationIds.length === 0) {
    throw ApiError.badRequest(
      'This booking has no itinerary yet, so there is nothing to check documents against.',
      { code: 'NO_ITINERARY' }
    );
  }

  const maxAltitude = (booking.segments || []).reduce(
    (highest, segment) => Math.max(highest, segment.maxAltitudeMetres || 0),
    0
  );

  const travellers = booking.travellers || [];
  const perTraveller = [];

  for (const traveller of travellers) {
    // eslint-disable-next-line no-await-in-loop
    const checklist = await travellerService.buildChecklist({
      travellerId: traveller.id,
      destinationIds,
      departureDate: booking.departureDate,
      returnDate: booking.returnDate,
      maxAltitudeMetres: maxAltitude || null,
    });
    perTraveller.push(checklist);
  }

  const outstanding = perTraveller.reduce((sum, entry) => sum + entry.summary.outstanding, 0);
  const overdue = perTraveller.reduce((sum, entry) => sum + entry.summary.overdue, 0);

  return {
    booking: {
      id: String(booking.id),
      reference: booking.reference,
      title: booking.title,
      status: booking.status,
      departureDate: booking.departureDate,
    },
    summary: {
      partySize: travellers.length,
      travellersReady: perTraveller.filter((entry) => entry.summary.ready).length,
      outstanding,
      overdue,
      ready: travellers.length > 0 && outstanding === 0,
      maxAltitudeMetres: maxAltitude || null,
    },
    travellers: perTraveller,
  };
}

module.exports = {
  list,
  getById,
  create,
  update,
  cancel,
  addTraveller,
  removeTraveller,
  listSegments,
  addSegment,
  getSegment,
  updateSegment,
  deleteSegment,
  reorderSegments,
  readiness,
};
