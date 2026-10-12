'use strict';

const { OperatorConfirmation, Booking, ItinerarySegment, Destination, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const operatorService = require('./operator.service');

/**
 * What an operator can see and do about their own confirmations.
 *
 * A thin, ownership-scoped wrapper around operator.service.js rather than a
 * reimplementation. `respond` in particular is the exact same status machine
 * a coordinator drives from the staff side — this file's whole job is making
 * sure an operator can only ever reach a row that is theirs, then handing off
 * to the same logic. See travellerPortal.service.js for the traveller-side
 * version of the same idea.
 */

const CONFIRMATION_SORTABLE = ['dueBy', 'createdAt', 'status', 'serviceType'];

const CONFIRMATION_INCLUDE = [
  {
    model: Booking,
    as: 'booking',
    required: false,
    include: [{ model: User, as: 'consultant', required: false }],
  },
  {
    model: ItinerarySegment,
    as: 'segment',
    required: false,
    include: [{ model: Destination, as: 'destination', required: false }],
  },
];

/** Every confirmation this operator has ever been asked about. */
async function listConfirmations(operatorId, query = {}) {
  const options = parseListQuery(query, {
    sortable: CONFIRMATION_SORTABLE,
    defaultSort: 'dueBy:asc',
  });

  const where = { operatorId };
  if (query.status) where.status = query.status;

  const result = await OperatorConfirmation.findAndCountAll({
    where,
    include: CONFIRMATION_INCLUDE,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
    distinct: true,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

/** One confirmation — 404, not 403, if it belongs to a different operator. */
async function getConfirmation(operatorId, id) {
  const confirmation = await OperatorConfirmation.findOne({
    where: { id, operatorId },
    include: CONFIRMATION_INCLUDE,
  });
  if (!confirmation) throw ApiError.notFound('Confirmation not found.');
  return confirmation;
}

/**
 * Answer a request for this operator's own confirmation.
 *
 * Ownership is checked here, then the actual status change is
 * `operatorService.respond` with `actingUser: null` — the same function a
 * coordinator's "record the answer" screen calls, so the two paths can never
 * quietly disagree about what a valid transition is.
 */
async function respond(operatorId, id, payload) {
  await getConfirmation(operatorId, id); // Throws 404 if this isn't theirs.
  return operatorService.respond(id, payload, null);
}

module.exports = { listConfirmations, getConfirmation, respond };
