'use strict';

const { Op } = require('sequelize');

const {
  Booking,
  BookingTraveller,
  Destination,
  ItinerarySegment,
  Traveller,
  TravellerDocument,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const travellerService = require('./traveller.service');
const paymentService = require('./payment.service');
const notificationService = require('./notification.service');
const fileStorage = require('./fileStorage.service');

/**
 * What a traveller can see about their own trip.
 *
 * The staff booking payload is not reused. It carries the sell price, the
 * deposit, internal notes and the whole party's records, and the reason a
 * traveller must not see those is not that they are secret — it is that a
 * response shape which happens to be safe today becomes unsafe the first time
 * somebody adds a field to it for a staff screen. This file builds the
 * traveller's view field by field, so adding something for staff cannot leak
 * here by accident.
 */

const TRIP_INCLUDE = [
  { model: User, as: 'coordinator', required: false },
  { model: User, as: 'consultant', required: false },
  {
    model: ItinerarySegment,
    as: 'segments',
    required: false,
    include: [{ model: Destination, as: 'destination', required: false }],
  },
];

function toTripJSON(booking, { includeSegments = true } = {}) {
  return {
    id: String(booking.id),
    reference: booking.reference,
    title: booking.title,
    status: booking.status,
    departureDate: booking.departureDate,
    returnDate: booking.returnDate,
    partySize: booking.partySize,
    // The agency's contacts, which is the useful half of the staff fields. No
    // amounts, no internal notes, no other traveller's record.
    coordinator: booking.coordinator
      ? { fullName: booking.coordinator.fullName(), email: booking.coordinator.email }
      : null,
    consultant: booking.consultant
      ? { fullName: booking.consultant.fullName(), email: booking.consultant.email }
      : null,
    segments:
      includeSegments && booking.segments
        ? [...booking.segments]
            .sort((a, b) => a.sequence - b.sequence)
            .map((segment) => segment.toPublicJSON())
        : undefined,
  };
}

/** Bookings this traveller is on. Cancelled ones are excluded — they are not trips. */
async function listTrips(travellerId) {
  const memberships = await BookingTraveller.findAll({
    where: { travellerId },
    attributes: ['bookingId'],
  });
  const bookingIds = memberships.map((row) => row.bookingId);
  if (bookingIds.length === 0) return [];

  const bookings = await Booking.findAll({
    where: { id: { [Op.in]: bookingIds }, status: { [Op.ne]: 'cancelled' } },
    include: TRIP_INCLUDE,
    order: [['departureDate', 'ASC']],
  });

  return bookings.map((booking) => toTripJSON(booking, { includeSegments: false }));
}

/**
 * One trip, with the traveller's own document checklist against it.
 *
 * The checklist is computed from exactly the same service the staff readiness
 * view uses. Two implementations of "is this person ready to travel" would
 * eventually disagree, and the traveller would be the one who found out at an
 * airport.
 */
async function getTrip(travellerId, bookingId) {
  const membership = await BookingTraveller.findOne({ where: { travellerId, bookingId } });
  if (!membership) throw ApiError.notFound('Trip not found.');

  const booking = await Booking.findByPk(bookingId, { include: TRIP_INCLUDE });
  if (!booking) throw ApiError.notFound('Trip not found.');

  const traveller = await Traveller.findByPk(travellerId, {
    include: [
      {
        model: TravellerDocument,
        as: 'documents',
        required: false,
        include: [{ model: Destination, as: 'destination', required: false }],
      },
    ],
  });

  const segments = booking.segments || [];
  const destinationIds = [...new Set(segments.map((segment) => String(segment.destinationId)))];

  let checklist = null;
  if (destinationIds.length > 0) {
    const maxAltitudeMetres = segments.reduce(
      (highest, segment) => Math.max(highest, segment.maxAltitudeMetres || 0),
      0
    );
    checklist = await travellerService.buildChecklist({
      travellerId,
      destinationIds,
      departureDate: booking.departureDate,
      returnDate: booking.returnDate,
      maxAltitudeMetres: maxAltitudeMetres || null,
    });
  }

  return {
    trip: toTripJSON(booking),
    traveller: traveller.toSelfJSON(),
    checklist,
  };
}

/**
 * A trip's payment plan, as the traveller should see it.
 *
 * Reuses `paymentService.listSchedules` — the same read the finance screen
 * uses — rather than re-deriving "paid so far" a second way, for the same
 * reason `getTrip`'s checklist reuses `travellerService.buildChecklist`. What
 * changes here is the shape: no `notes`, no `createdBy`, no `booking` (the
 * caller already knows which trip this is) — a traveller sees what they owe
 * and what they've paid, not the agency's internal bookkeeping on it.
 */
async function getTripPayments(travellerId, bookingId) {
  const membership = await BookingTraveller.findOne({ where: { travellerId, bookingId } });
  if (!membership) throw ApiError.notFound('Trip not found.');

  const { data: schedules } = await paymentService.listSchedules({
    bookingId,
    perPage: 100,
    sort: 'dueOn:asc',
  });

  return schedules.map((schedule) => ({
    id: schedule.id,
    label: schedule.label,
    dueOn: schedule.dueOn,
    daysUntilDue: schedule.daysUntilDue,
    currencyCode: schedule.currencyCode,
    amount: schedule.amount,
    status: schedule.status,
    isLive: schedule.isLive,
    paid: schedule.paid,
    outstanding: schedule.outstanding,
    settled: schedule.settled,
    overdue: schedule.overdue,
  }));
}

/**
 * Every document on this traveller's own record, newest first.
 *
 * Documents belong to the traveller, not to any one trip, so this is not
 * folded into `getTrip` — a traveller with more than one booking would
 * otherwise see the same document list repeated under each, or missing
 * entirely from whichever trip it wasn't originally filed against.
 */
async function listDocuments(travellerId) {
  const documents = await TravellerDocument.findAll({
    where: { travellerId },
    include: [
      { model: Destination, as: 'destination', required: false },
      { model: User, as: 'verifiedBy', required: false },
    ],
    order: [['createdAt', 'DESC']],
  });
  return documents.map((document) => document.toPublicJSON());
}

/**
 * A traveller adding one of their own documents from the portal.
 *
 * Always lands as `submitted`, never `verified` — that step stays staff-only
 * (see `document_verified`/`document_rejected` in the notifications API), so
 * a traveller cannot self-certify a policy the agency hasn't actually looked
 * at. `filePath` here is a reference (a link to where the file lives), the
 * same convention the staff-entered rows already use — this codebase has no
 * binary upload endpoint, on either side.
 */
/**
 * @param {object} payload  Validated body fields.
 * @param {object} [file]  A multer file object (`{ buffer, mimetype, originalname }`),
 *   present only when the request was a multipart upload with a `file` field.
 */
async function addOwnDocument(travellerId, payload, file) {
  if (payload.destinationId) {
    const destination = await Destination.findByPk(payload.destinationId);
    if (!destination) {
      throw ApiError.badRequest('That destination does not exist.', {
        code: 'INVALID_DESTINATION',
        details: { destinationId: 'Not found.' },
      });
    }
  }

  let fileFields = {};
  if (file) {
    const stored = await fileStorage.store({
      travellerId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    fileFields = {
      storedFileName: stored.storedFileName,
      originalFileName: stored.originalFileName,
      fileMimeType: stored.mimeType,
      fileSizeBytes: stored.sizeBytes,
    };
  }

  const created = await TravellerDocument.create({
    ...payload,
    ...fileFields,
    travellerId,
    status: 'submitted',
    verifiedByUserId: null,
    verifiedAt: null,
  });

  const withDestination = await TravellerDocument.findByPk(created.id, {
    include: [{ model: Destination, as: 'destination', required: false }],
  });

  const traveller = await Traveller.findByPk(travellerId);
  await notificationService.documentSubmitted(withDestination, traveller);

  return withDestination;
}

/**
 * The absolute path to one of the traveller's own uploaded files —
 * membership is "this document belongs to this traveller", the same check
 * `getTrip`/`getTripPayments` use for a booking.
 */
async function getOwnDocumentFilePath(travellerId, documentId) {
  const document = await TravellerDocument.findOne({ where: { id: documentId, travellerId } });
  if (!document) throw ApiError.notFound('Document not found.');
  if (!document.storedFileName) throw ApiError.notFound('This document has no uploaded file.');
  return { document, absolutePath: fileStorage.resolvePath(document.storedFileName) };
}

module.exports = {
  listTrips,
  getTrip,
  getTripPayments,
  listDocuments,
  addOwnDocument,
  getOwnDocumentFilePath,
  toTripJSON,
};
