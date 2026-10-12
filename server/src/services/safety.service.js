'use strict';

const { Op } = require('sequelize');

const {
  Booking,
  BookingTraveller,
  LocationConsent,
  LocationPing,
  SosAlert,
  SosAlertEvent,
  Traveller,
  User,
} = require('../models');
const { parseListQuery, paginated } = require('../utils/pagination');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');

/**
 * The traveller safety module.
 *
 * Three rules hold everywhere in this file, and they are the module:
 *
 *   1. No location is recorded without consent for that specific trip. Not a
 *      global preference, not an account setting — this trip.
 *   2. An SOS is never blocked by anything. Not by missing consent, not by a
 *      lapsed session, not by a rate limit. A safety feature that can refuse is
 *      not a safety feature.
 *   3. Nothing closes itself. An alert stays open until a person closes it.
 *
 * Rules 1 and 2 pull in opposite directions and the tension is resolved
 * explicitly: pressing SOS attaches the position taken at that moment to the
 * alert itself, which is an incident record, and does not start location
 * sharing. Consent is still required before the trip is tracked.
 */

const CONSENT_STATEMENT =
  'I agree to share my location with Himalayas Travel and Tour for the duration of this trip. ' +
  'I can stop sharing at any time. Records are deleted after the trip ends.';

// --- Shared lookups --------------------------------------------------------

/** Confirm a traveller is actually on a booking before touching its safety data. */
async function assertOnBooking(travellerId, bookingId) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found.');

  const membership = await BookingTraveller.findOne({ where: { bookingId, travellerId } });
  if (!membership) {
    // Deliberately "not found" rather than "forbidden": confirming that a
    // booking exists but is not yours still tells a stranger it exists.
    throw ApiError.notFound('Booking not found.');
  }
  return booking;
}

// --- Consent ---------------------------------------------------------------

async function getConsent(travellerId, bookingId) {
  return LocationConsent.findOne({ where: { travellerId, bookingId } });
}

/**
 * Record a consent decision.
 *
 * Withdrawal is instant and needs no reason. It does not delete what was
 * already collected — those records were collected lawfully and are purged on
 * the ordinary retention schedule — but nothing more is added from this moment.
 */
async function setConsent(travellerId, bookingId, { granted }) {
  await assertOnBooking(travellerId, bookingId);

  const existing = await getConsent(travellerId, bookingId);
  const now = new Date();

  const values = granted
    ? {
        status: 'granted',
        grantedAt: now,
        withdrawnAt: null,
        consentStatement: CONSENT_STATEMENT,
      }
    : { status: 'withdrawn', withdrawnAt: now };

  if (existing) {
    await existing.update(values);
    return existing;
  }

  return LocationConsent.create({ travellerId, bookingId, ...values });
}

// --- Location pings --------------------------------------------------------

/**
 * Record a position.
 *
 * Refused without consent, and refused rather than silently dropped — a phone
 * that thinks it is sharing when it is not is worse than one that knows it
 * isn't. Pings closer together than MIN_PING_INTERVAL_SECONDS are accepted and
 * discarded, because that is the client being chatty rather than an error worth
 * showing a traveller on a mountain.
 */
async function recordPing(travellerId, payload) {
  const { bookingId } = payload;
  await assertOnBooking(travellerId, bookingId);

  const consent = await getConsent(travellerId, bookingId);
  if (!consent || !consent.isGranted()) {
    throw ApiError.forbidden('Location sharing is switched off for this trip.', {
      code: 'LOCATION_CONSENT_REQUIRED',
    });
  }

  const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : new Date();

  const latest = await LocationPing.findOne({
    where: { travellerId, bookingId },
    order: [['recordedAt', 'DESC']],
  });

  if (
    latest &&
    recordedAt.getTime() - latest.recordedAt.getTime() <
      env.safety.minPingIntervalSeconds * 1000
  ) {
    return { ping: latest, stored: false };
  }

  const ping = await LocationPing.create({
    travellerId,
    bookingId,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracyMetres: payload.accuracyMetres ?? null,
    altitudeMetres: payload.altitudeMetres ?? null,
    batteryPercent: payload.batteryPercent ?? null,
    source: payload.source || 'device',
    recordedAt,
  });

  return { ping, stored: true };
}

async function listPings(travellerId, bookingId, { limit = 50 } = {}) {
  await assertOnBooking(travellerId, bookingId);
  return LocationPing.findAll({
    where: { travellerId, bookingId },
    order: [['recordedAt', 'DESC']],
    limit: Math.min(limit, 500),
  });
}

/**
 * Where the party was last seen — the staff view.
 *
 * Every traveller on the booking appears, including those who have not
 * consented. Their entry says so and carries no position. Leaving them out
 * would let a coordinator scanning the list mistake "not sharing" for
 * "accounted for".
 */
async function partyLocations(bookingId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{ model: Traveller, as: 'travellers', required: false }],
  });
  if (!booking) throw ApiError.notFound('Booking not found.');

  const travellers = booking.travellers || [];
  const consents = await LocationConsent.findAll({ where: { bookingId } });
  const consentByTraveller = new Map(consents.map((row) => [String(row.travellerId), row]));

  const rows = await Promise.all(
    travellers.map(async (traveller) => {
      const consent = consentByTraveller.get(String(traveller.id));
      const sharing = Boolean(consent && consent.isGranted());

      const lastPing = sharing
        ? await LocationPing.findOne({
            where: { travellerId: traveller.id, bookingId },
            order: [['recordedAt', 'DESC']],
          })
        : null;

      return {
        traveller: {
          id: String(traveller.id),
          fullName: traveller.fullName(),
          phone: traveller.phone,
        },
        sharing,
        consentStatus: consent ? consent.status : 'not_asked',
        lastSeen: lastPing ? lastPing.toPublicJSON() : null,
        // Hours since the last fix, so "sharing but silent for two days" reads
        // differently from "sharing, seen twenty minutes ago".
        hoursSinceLastSeen: lastPing
          ? Math.round(((Date.now() - lastPing.recordedAt.getTime()) / 3600000) * 10) / 10
          : null,
      };
    })
  );

  return { bookingId: String(booking.id), reference: booking.reference, party: rows };
}

// --- SOS -------------------------------------------------------------------

const ALERT_INCLUDE = [
  { model: Traveller, as: 'traveller', required: false },
  { model: Booking, as: 'booking', required: false },
  { model: User, as: 'acknowledgedBy', required: false },
  { model: User, as: 'resolvedBy', required: false },
  { model: User, as: 'assignedTo', required: false },
  { model: User, as: 'assignedBy', required: false },
];

async function getAlert(id) {
  const alert = await SosAlert.findByPk(id, { include: ALERT_INCLUDE });
  if (!alert) throw ApiError.notFound('Alert not found.');
  return alert;
}

/**
 * Append one entry to an alert's history.
 *
 * Never throws. Rule 2 at the top of this file says an SOS is not blocked by
 * anything, and that has to include its own paperwork: an alert that fails
 * to be raised, or acknowledged, because the log table could not be written
 * would be the log doing harm. A failure here is reported and the action it
 * was describing stands.
 *
 * @param {object} alert
 * @param {string} type        One of SosAlertEvent.TYPES.
 * @param {object} [options]
 * @param {object|null} [options.staff]  The member of staff who did it.
 * @param {boolean} [options.system]     The platform did it (escalation).
 *   With neither, it was the traveller the alert belongs to.
 * @param {string} [options.detail]
 * @param {Date} [options.at]            When; defaults to now.
 */
async function recordEvent(alert, type, { staff = null, system = false, detail = null, at } = {}) {
  try {
    const when = at || new Date();
    await SosAlertEvent.create({
      alertId: alert.id,
      type,
      actorKind: system ? 'system' : staff ? 'staff' : 'traveller',
      actorUserId: staff ? staff.id : null,
      detail: detail ? String(detail).slice(0, 1000) : null,
      createdAt: when,
      updatedAt: when,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Could not record SOS event "${type}" for alert ${alert.id}:`, error.message);
  }
}

/**
 * Raise an alert.
 *
 * Pressing the button twice does not create a second alert — the open one is
 * returned instead. Somebody in trouble pressing repeatedly is the expected
 * behaviour, and the consequence should not be a queue of duplicates for
 * whoever is answering.
 *
 * The position, if the phone had one, is copied onto the alert rather than
 * stored as a ping. It is part of an incident record, so it outlives the
 * location retention window, and it is captured whether or not the traveller
 * consented to tracking: pressing SOS is consent to be found.
 */
async function raiseSos(travellerId, payload) {
  const { bookingId } = payload;
  await assertOnBooking(travellerId, bookingId);

  const open = await SosAlert.findOne({
    where: { travellerId, bookingId, status: { [Op.in]: SosAlert.OPEN_STATUSES } },
    include: ALERT_INCLUDE,
  });

  if (open) return { alert: open, created: false };

  const created = await SosAlert.create({
    travellerId,
    bookingId,
    status: 'raised',
    raisedAt: new Date(),
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    accuracyMetres: payload.accuracyMetres ?? null,
    message: payload.message || null,
  });

  const alert = await getAlert(created.id);

  const position =
    alert.latitude === null || alert.latitude === undefined
      ? 'No position sent.'
      : 'Position sent.';
  await recordEvent(alert, 'raised', {
    detail: alert.message ? `${position} Note: "${alert.message}"` : position,
    at: alert.raisedAt,
  });

  // After the alert exists, and unable to prevent it existing. The notification
  // is how staff find out; the row is what makes it true.
  await notificationService.sosRaised(alert, alert.traveller, alert.booking);

  return { alert, created: true };
}

/** The traveller withdraws their own alert. Only their own, and only while open. */
async function cancelSos(travellerId, alertId) {
  const alert = await getAlert(alertId);

  if (String(alert.travellerId) !== String(travellerId)) {
    throw ApiError.notFound('Alert not found.');
  }
  if (!alert.isOpen()) {
    throw ApiError.badRequest('This alert is already closed.', { code: 'ALERT_CLOSED' });
  }

  await alert.update({ status: 'cancelled', cancelledAt: new Date() });
  await recordEvent(alert, 'cancelled', { at: alert.cancelledAt });
  return getAlert(alertId);
}

/**
 * Staff take ownership.
 *
 * Acknowledging is not resolving. It says somebody has seen it and is acting,
 * which is the thing a traveller most needs to know and the thing a duty roster
 * most needs recorded.
 */
async function acknowledgeSos(alertId, actingUser) {
  const alert = await getAlert(alertId);

  if (alert.status !== 'raised') {
    throw ApiError.badRequest(
      alert.status === 'acknowledged'
        ? 'This alert has already been acknowledged.'
        : 'This alert is already closed.',
      { code: 'ALERT_NOT_OPEN' }
    );
  }

  await alert.update({
    status: 'acknowledged',
    acknowledgedAt: new Date(),
    acknowledgedByUserId: actingUser.id,
  });

  await recordEvent(alert, 'acknowledged', { staff: actingUser, at: alert.acknowledgedAt });

  const updated = await getAlert(alertId);
  await notificationService.sosAcknowledged(updated, updated.traveller, actingUser);
  return updated;
}

/**
 * Hand an open alert to a specific person — not necessarily the person doing
 * the assigning. Independent of acknowledging: the person at the desk at
 * 2am is often not the right person to run the response, and until now the
 * only way to route it to, say, the on-call coordinator was to ring them.
 *
 * `userId: null` unassigns. Either way this is recorded against whoever made
 * the call (`assignedByUserId`), same reasoning as a task handover.
 */
async function assignSos(alertId, userId, actingUser) {
  const alert = await getAlert(alertId);

  if (!alert.isOpen()) {
    throw ApiError.badRequest('This alert is already closed.', { code: 'ALERT_CLOSED' });
  }

  if (userId === null) {
    // The alert row is about to forget who had it; the log is the only place
    // that will still know.
    const previous = alert.assignedTo;
    await alert.update({ assignedToUserId: null, assignedAt: null, assignedByUserId: actingUser.id });
    if (previous) {
      await recordEvent(alert, 'unassigned', {
        staff: actingUser,
        detail: `Was with ${previous.fullName()}`,
      });
    }
    return getAlert(alertId);
  }

  const assignee = await User.findByPk(userId);
  if (!assignee || !assignee.isActive || !notificationService.TRIP_EDITOR_ROLES.includes(assignee.role)) {
    throw ApiError.badRequest('Choose an active consultant, coordinator or admin.', {
      code: 'VALIDATION_ERROR',
      details: { userId: 'Not an active trip editor.' },
    });
  }

  await alert.update({
    assignedToUserId: assignee.id,
    assignedAt: new Date(),
    assignedByUserId: actingUser.id,
  });
  await recordEvent(alert, 'assigned', {
    staff: actingUser,
    detail: `To ${assignee.fullName()}`,
    at: alert.assignedAt,
  });

  const updated = await getAlert(alertId);
  await notificationService.notify({
    recipients: [assignee],
    actor: actingUser,
    type: 'sos_assigned',
    severity: 'urgent',
    title: `${actingUser.fullName()} handed you ${updated.traveller.fullName()}'s SOS`,
    body: updated.booking ? `${updated.booking.reference} · ${updated.booking.title}` : null,
    link: '/safety',
  });
  return updated;
}

/** Close an alert. Requires notes — "resolved" with no account of how is not a record. */
async function resolveSos(alertId, { notes }, actingUser) {
  const alert = await getAlert(alertId);

  if (!alert.isOpen()) {
    throw ApiError.badRequest('This alert is already closed.', { code: 'ALERT_CLOSED' });
  }

  await alert.update({
    status: 'resolved',
    resolvedAt: new Date(),
    resolvedByUserId: actingUser.id,
    resolutionNotes: notes,
  });
  await recordEvent(alert, 'resolved', { staff: actingUser, detail: notes, at: alert.resolvedAt });

  const updated = await getAlert(alertId);
  await notificationService.sosResolved(updated, updated.traveller, actingUser);
  return updated;
}

/**
 * Alerts for the staff screens.
 *
 * Open ones first and oldest first within that, because the alert that has been
 * waiting longest is the one that matters most. Every other list in this
 * codebase sorts newest first; this one deliberately does not.
 */
async function listAlerts({ status, bookingId } = {}) {
  const where = {};
  if (status === 'open') where.status = { [Op.in]: SosAlert.OPEN_STATUSES };
  else if (status) where.status = status;
  if (bookingId) where.bookingId = bookingId;

  const alerts = await SosAlert.findAll({
    where,
    include: ALERT_INCLUDE,
    order: [['raisedAt', 'ASC']],
    limit: 200,
  });

  // Open before closed, done here rather than in SQL. Ordering by the status
  // enum sorts by declaration order in MySQL and alphabetically in SQLite, and
  // a CASE expression collides with `bookings.status` in the join. Two hundred
  // rows in memory is not the place to be clever.
  return alerts.sort((a, b) => Number(b.isOpen()) - Number(a.isOpen()));
}

/**
 * Re-notify every trip editor about an alert nobody has claimed.
 *
 * Only `raised` alerts with no assignee — the moment somebody acknowledges
 * or the alert is assigned, a named person owns it and the normal
 * acknowledge/resolve flow is the mechanism, not a repeating page. Escalates
 * again every `sosEscalationMinutes`, not once: a `level` (how many whole
 * intervals have passed) is folded into the dedupe key, the same way a task
 * that goes overdue again after being rescheduled gets a new notification
 * rather than staying silent because *an* overdue notification already
 * exists for it.
 *
 * Run from the scheduled sweep (`jobs/sosEscalation.js`), not computed on
 * read — see the file comment on why nothing here is computed lazily.
 */
async function escalateStaleSos({ now = new Date() } = {}) {
  const intervalMinutes = env.safety.sosEscalationMinutes;

  const candidates = await SosAlert.findAll({
    where: { status: 'raised', assignedToUserId: null },
    include: ALERT_INCLUDE,
  });

  // Computed against the `now` passed in, not `alert.minutesOpen()` (which
  // always measures against the real clock) — a test driving this sweep
  // needs to simulate time passing without actually waiting minutes.
  const minutesSinceRaised = (alert) =>
    Math.max(0, Math.round((now.getTime() - alert.raisedAt.getTime()) / 60000));

  const stale = candidates.filter((alert) => minutesSinceRaised(alert) >= intervalMinutes);

  let notified = 0;
  for (const alert of stale) {
    const minutesOpen = minutesSinceRaised(alert);
    const level = Math.floor(minutesOpen / intervalMinutes);
    // eslint-disable-next-line no-await-in-loop
    const recipients = await notificationService.staffWithRoles(
      notificationService.TRIP_EDITOR_ROLES
    );
    // eslint-disable-next-line no-await-in-loop
    const result = await notificationService.notify({
      recipients,
      type: 'sos_escalated',
      severity: 'urgent',
      title: `Still unclaimed — ${alert.traveller.fullName()}'s SOS`,
      body: `Raised ${minutesOpen} minutes ago and nobody has taken it yet.`,
      link: '/safety',
      dedupeKey: `sos:${alert.id}:escalated:${level}`,
    });
    notified += result.created;

    // One entry per escalation that actually told somebody, not one per run
    // of the sweep. The sweep runs every minute; the dedupe key above is what
    // knows whether this level has already gone out.
    if (result.created > 0) {
      // eslint-disable-next-line no-await-in-loop
      await recordEvent(alert, 'escalated', {
        system: true,
        detail: `Unclaimed for ${minutesOpen} minutes. ${result.created} ${
          result.created === 1 ? 'person' : 'people'
        } notified.`,
        at: now,
      });
    }
  }

  return { checked: candidates.length, escalated: stale.length, notified };
}

// --- The log ---------------------------------------------------------------

/** One alert's history, oldest first — read top to bottom as what happened. */
async function listAlertEvents(alertId) {
  const alert = await getAlert(alertId);
  const events = await SosAlertEvent.findAll({
    where: { alertId: alert.id },
    include: [{ model: User, as: 'actor', required: false }],
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  // Attached by hand rather than joined: every row here is about the same
  // alert, and the traveller's name is what a "raised" entry is shown under.
  for (const event of events) event.alert = alert;
  return events.map((event) => {
    const { alert: _omitted, ...json } = event.toPublicJSON();
    return json;
  });
}

/**
 * Every SOS event across every alert, newest first.
 *
 * Open to every staff role, the same as the alerts themselves and for the
 * same reason. It carries nothing an alert does not already show: no
 * coordinates, only whether a position was sent.
 */
async function listEvents(query = {}) {
  const options = parseListQuery(query, { sortable: ['createdAt'], defaultSort: 'createdAt:desc' });

  const where = {};
  if (query.type) where.type = query.type;
  if (query.alertId) where.alertId = query.alertId;

  const alertWhere = {};
  if (query.bookingId) alertWhere.bookingId = query.bookingId;

  const result = await SosAlertEvent.findAndCountAll({
    where,
    include: [
      { model: User, as: 'actor', required: false },
      {
        model: SosAlert,
        as: 'alert',
        required: true,
        where: alertWhere,
        include: [
          { model: Traveller, as: 'traveller', required: false },
          { model: Booking, as: 'booking', required: false },
        ],
      },
    ],
    limit: options.limit,
    offset: options.offset,
    // The id breaks ties: two events in the same second (assigned, then
    // acknowledged by the same click-happy person) must not swap places
    // between one page load and the next.
    order: [...options.order, ['id', options.order[0][1]]],
    distinct: true,
  });

  return paginated(result, options, (event) => event.toPublicJSON());
}

// --- Traveller summary -----------------------------------------------------

/** Everything the traveller's safety screen needs, in one call. */
async function travellerSummary(travellerId, bookingId) {
  await assertOnBooking(travellerId, bookingId);

  const [consent, lastPing, openAlert] = await Promise.all([
    getConsent(travellerId, bookingId),
    LocationPing.findOne({
      where: { travellerId, bookingId },
      order: [['recordedAt', 'DESC']],
    }),
    SosAlert.findOne({
      where: { travellerId, bookingId, status: { [Op.in]: SosAlert.OPEN_STATUSES } },
      include: ALERT_INCLUDE,
    }),
  ]);

  return {
    bookingId: String(bookingId),
    consent: consent
      ? consent.toPublicJSON()
      : {
          travellerId: String(travellerId),
          bookingId: String(bookingId),
          status: 'withdrawn',
          granted: false,
          grantedAt: null,
          withdrawnAt: null,
          consentStatement: null,
        },
    consentStatement: CONSENT_STATEMENT,
    lastSeen: lastPing ? lastPing.toPublicJSON() : null,
    openAlert: openAlert ? openAlert.toPublicJSON() : null,
    retentionDays: env.safety.locationRetentionDays,
  };
}

// --- Retention -------------------------------------------------------------

/**
 * Delete location pings for trips that ended more than the retention window ago.
 *
 * The commitment in the README is that location records do not outlive the trip
 * by more than LOCATION_RETENTION_DAYS. This function is that commitment; a
 * promise in a document with no code behind it is just a document.
 *
 * Bookings with no return date are measured from their departure instead, and
 * bookings with neither are left alone rather than guessed at.
 */
async function purgeExpiredLocations({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - env.safety.locationRetentionDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const expired = await Booking.findAll({
    attributes: ['id'],
    where: {
      [Op.or]: [
        { returnDate: { [Op.lt]: cutoff } },
        { returnDate: null, departureDate: { [Op.lt]: cutoff } },
      ],
    },
  });

  if (expired.length === 0) return { bookings: 0, pingsDeleted: 0 };

  const bookingIds = expired.map((booking) => booking.id);
  const pingsDeleted = await LocationPing.destroy({
    where: { bookingId: { [Op.in]: bookingIds } },
  });

  return { bookings: bookingIds.length, pingsDeleted };
}

module.exports = {
  CONSENT_STATEMENT,
  assertOnBooking,
  getConsent,
  setConsent,
  recordPing,
  listPings,
  partyLocations,
  getAlert,
  raiseSos,
  cancelSos,
  acknowledgeSos,
  assignSos,
  resolveSos,
  listAlerts,
  escalateStaleSos,
  listAlertEvents,
  listEvents,
  travellerSummary,
  purgeExpiredLocations,
};
