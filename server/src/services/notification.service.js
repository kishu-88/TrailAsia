'use strict';

const { Op } = require('sequelize');

const { Notification, Task, User, Traveller, Operator } = require('../models');
const ApiError = require('../utils/ApiError');
const mailerService = require('./mailer.service');
const { parseListQuery, paginated } = require('../utils/pagination');

/**
 * In-app notifications — the bell in the top bar, and (since Mailgun was
 * wired in) an email copy of every one of them, best-effort.
 *
 * Two rules run through this file.
 *
 * **Raising a notification must never break the thing that caused it.** Every
 * producer call is wrapped: if the insert fails, the SOS is still raised and the
 * task is still assigned, and the failure is logged rather than thrown. A
 * notification is a courtesy; the action is the product. Getting this backwards
 * would mean a bug in the bell could stop somebody calling for help.
 *
 * **Nobody is told what they just did.** The actor is filtered out of every
 * audience. A bell that lights up because you clicked something trains people to
 * ignore it, and an ignored bell is worse than none — it looks like coverage
 * that is not there.
 */

const TRIP_EDITOR_ROLES = ['consultant', 'coordinator', 'admin'];

/** Active staff in the given roles. The audience for anything operational. */
async function staffWithRoles(roles) {
  return User.findAll({ where: { isActive: true, role: { [Op.in]: roles } } });
}

/**
 * Create one notification per recipient.
 *
 * Returns `{ rows, created }` — `created` counts rows that did not already
 * exist, which is what a deduplicated caller wants to know and what an
 * existence check alone cannot tell it.
 *
 * @param {object} options
 * @param {Array} options.recipients  User/Traveller/Operator instances or ids.
 * @param {'user'|'traveller'|'operator'} options.recipientKind  Which of the
 *   three the `recipients` array holds, i.e. which FK column to fill. Staff
 *   stays the default so every existing call site is unaffected.
 * @param {object} options.actor      Who caused it; excluded from the audience.
 *   Always a staff User (or null for "the platform") — travellers and
 *   operators cause events too, but nothing here has needed to *name* one as
 *   an actor yet, so `actorUserId` stays staff-only rather than growing the
 *   same three-way ambiguity `notify` itself has to resolve for `recipients`.
 * @param {string} options.dedupeKey  Optional. Unique per recipient — a repeated
 *   condition creates nothing rather than piling up.
 */
async function notify({
  recipients = [],
  recipientKind = 'user',
  actor = null,
  type,
  severity = 'info',
  title,
  body = null,
  link = null,
  dedupeKey = null,
}) {
  const recipientColumn = { user: 'userId', traveller: 'travellerId', operator: 'operatorId' }[
    recipientKind
  ];
  if (!recipientColumn) {
    throw new Error(`Unknown notification recipientKind: ${recipientKind}`);
  }

  try {
    const ids = [
      ...new Set(
        recipients
          .filter(Boolean)
          .map((recipient) => String(recipient.id ?? recipient))
          .filter((id) => recipientKind !== 'user' || !actor || id !== String(actor.id))
      ),
    ];

    if (ids.length === 0) return { rows: [], created: 0 };

    const rows = [];
    const createdRows = [];
    let created = 0;

    for (const recipientId of ids) {
      const values = {
        [recipientColumn]: recipientId,
        actorUserId: actor ? actor.id : null,
        type,
        severity,
        title,
        body,
        link,
        dedupeKey,
      };

      if (dedupeKey) {
        // eslint-disable-next-line no-await-in-loop
        const [row, wasCreated] = await Notification.findOrCreate({
          where: { [recipientColumn]: recipientId, dedupeKey },
          defaults: values,
        });
        rows.push(row);
        if (wasCreated) {
          created += 1;
          createdRows.push(row);
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        const row = await Notification.create(values);
        rows.push(row);
        created += 1;
        createdRows.push(row);
      }
    }

    // Only newly-created rows get an email — a dedupe hit means the sweep
    // that called this has already told this recipient about this exact
    // fact, and re-emailing them every time a cron tick finds the same
    // overdue task would turn the inbox into the thing everyone mutes.
    if (createdRows.length > 0) {
      await emailNewRecipients(createdRows, recipientColumn, recipientKind);
    }

    return { rows, created };
  } catch (error) {
    // Deliberately swallowed. See the file comment: the action that triggered
    // this has already happened and must not be rolled back for a bell.
    // eslint-disable-next-line no-console
    console.error('Could not raise notification:', error.message);
    return { rows: [], created: 0 };
  }
}

const RECIPIENT_MODELS = { user: User, traveller: Traveller, operator: Operator };
const RECIPIENT_EMAIL_FIELD = { user: 'email', traveller: 'email', operator: 'contactEmail' };

/**
 * The email half of `notify`. Kept out of the try/catch above on purpose —
 * it runs its own, so a Mailgun outage can never make `notify` report
 * `{ rows: [], created: 0 }` for a notification that was in fact written to
 * the database a moment earlier.
 */
async function emailNewRecipients(rows, recipientColumn, recipientKind) {
  try {
    const Model = RECIPIENT_MODELS[recipientKind];
    const emailField = RECIPIENT_EMAIL_FIELD[recipientKind];
    const ids = [...new Set(rows.map((row) => String(row[recipientColumn])))];

    const people = await Model.findAll({ where: { id: ids } });
    const byId = new Map(people.map((person) => [String(person.id), person]));

    await Promise.all(
      rows.map((row) => {
        const person = byId.get(String(row[recipientColumn]));
        const to = person ? person[emailField] : null;
        if (!to) return Promise.resolve();
        return mailerService.sendEmail({
          to,
          subject: row.title,
          text: row.body || row.title,
          context: `notification:${row.type}`,
        });
      })
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not email notification recipients:', error.message);
  }
}

// --- Producers -------------------------------------------------------------
//
// One function per event, so a caller says what happened rather than assembling
// a notification. The wording lives here, in one place, and a module raising an
// event does not need to know who hears about it.

/**
 * An SOS. The widest audience in the platform, on purpose: every trip editor,
 * whether or not the booking is theirs. At 2am the person at a desk is the
 * person who answers, and an alert routed only to the owning consultant is an
 * alert nobody sees.
 */
async function sosRaised(alert, traveller, booking) {
  const recipients = await staffWithRoles(TRIP_EDITOR_ROLES);
  return notify({
    recipients,
    type: 'sos_raised',
    severity: 'urgent',
    title: `SOS — ${traveller.fullName()}`,
    body: `${booking.reference} · ${booking.title}. ${
      alert.latitude !== null && alert.latitude !== undefined
        ? 'A position was reported.'
        : 'No position was reported.'
    }`,
    link: '/safety',
    dedupeKey: `sos:${alert.id}:raised`,
  });
}

/** Somebody has picked it up — the rest of the office can stand down. */
async function sosAcknowledged(alert, traveller, actor) {
  const recipients = await staffWithRoles(TRIP_EDITOR_ROLES);
  return notify({
    recipients,
    actor,
    type: 'sos_acknowledged',
    severity: 'warning',
    title: `${actor.fullName()} is handling ${traveller.fullName()}'s SOS`,
    body: 'Raised alert acknowledged.',
    link: '/safety',
    dedupeKey: `sos:${alert.id}:acknowledged`,
  });
}

async function sosResolved(alert, traveller, actor) {
  const recipients = await staffWithRoles(TRIP_EDITOR_ROLES);
  return notify({
    recipients,
    actor,
    type: 'sos_resolved',
    severity: 'info',
    title: `${traveller.fullName()}'s SOS is closed`,
    body: alert.resolutionNotes ? alert.resolutionNotes.slice(0, 400) : null,
    link: '/safety',
    dedupeKey: `sos:${alert.id}:resolved`,
  });
}

async function taskAssigned(task, assignee, actor) {
  return notify({
    recipients: [assignee],
    actor,
    type: 'task_assigned',
    severity: task.priority === 'urgent' ? 'warning' : 'info',
    title: `${actor ? actor.fullName() : 'Somebody'} gave you a task`,
    body: task.title,
    link: '/tasks',
  });
}

/** One notification for a whole handover, not one per task. */
async function tasksHandedOver(toUser, count, actor, note) {
  return notify({
    recipients: [toUser],
    actor,
    type: 'task_handover',
    severity: 'warning',
    title: `${count} task${count === 1 ? '' : 's'} handed to you`,
    body: note || `${actor ? actor.fullName() : 'Somebody'} handed over their open work.`,
    link: '/tasks',
  });
}

/**
 * A document was verified or rejected.
 *
 * Two audiences, two calls: the consultant who owns the record (as before —
 * they are who would otherwise have to keep checking), and now the traveller
 * themselves, since it is their own document and until this they had no way
 * to find out short of asking. A rejection with no reason attached is a dead
 * end for them, so the notes go in the body here too, not just staff's copy.
 */
async function documentReviewed(document, traveller, approved, actor) {
  const staffResult = traveller.createdByUserId
    ? await notify({
        recipients: [traveller.createdByUserId],
        actor,
        type: approved ? 'document_verified' : 'document_rejected',
        severity: approved ? 'info' : 'warning',
        title: approved
          ? `${traveller.fullName()}'s ${document.type} was verified`
          : `${traveller.fullName()}'s ${document.type} was rejected`,
        body: document.notes ? document.notes.slice(0, 400) : null,
        link: `/travellers/${traveller.id}`,
        dedupeKey: `document:${document.id}:${approved ? 'verified' : 'rejected'}:${
          document.verifiedAt ? document.verifiedAt.getTime() : Date.now()
        }`,
      })
    : { rows: [], created: 0 };

  const travellerResult = await notify({
    recipients: [traveller.id],
    recipientKind: 'traveller',
    type: approved ? 'document_verified' : 'document_rejected',
    severity: approved ? 'info' : 'warning',
    title: approved ? `Your ${document.type} was verified` : `Your ${document.type} needs attention`,
    body: approved
      ? 'A consultant has confirmed this document.'
      : document.notes
        ? document.notes.slice(0, 400)
        : 'A consultant could not verify this document — check it and resubmit.',
    link: '/my-trip',
    dedupeKey: `document:${document.id}:${approved ? 'verified' : 'rejected'}:${
      document.verifiedAt ? document.verifiedAt.getTime() : Date.now()
    }:traveller`,
  });

  return {
    rows: [...staffResult.rows, ...travellerResult.rows],
    created: staffResult.created + travellerResult.created,
  };
}

/**
 * A traveller added a document from their own portal.
 *
 * Same recipient as `documentReviewed` — whoever created the traveller
 * record — and for the same reason: that person is who would otherwise have
 * to keep checking whether anything showed up. It is also why this sits
 * separately from `document_verified`/`document_rejected` rather than
 * reusing one of them: those describe staff acting on a document, this
 * describes a traveller adding one, and a bell that reads "verified" for
 * something nobody has looked at yet would be wrong.
 */
async function documentSubmitted(document, traveller) {
  if (!traveller.createdByUserId) return { rows: [], created: 0 };
  return notify({
    recipients: [traveller.createdByUserId],
    type: 'document_submitted',
    severity: 'info',
    title: `${traveller.fullName()} added a document`,
    body: `${document.type} — submitted through the traveller portal.`,
    link: `/travellers/${traveller.id}`,
    dedupeKey: `document:${document.id}:submitted`,
  });
}

/**
 * Someone submitted the public site's general contact form.
 *
 * Reaches the same audience as `bookingService.createPublicEnquiry`'s
 * notification (`TRIP_EDITOR_ROLES`) — nobody was watching this happen
 * either, and a general question could turn into any of their work.
 * `link` is `null` — there is no staff screen for these messages yet (see
 * `contactMessage.service.js`); the bell still fires, but there's nowhere
 * to route a click to until one exists.
 */
async function contactMessageReceived(message) {
  const recipients = await staffWithRoles(TRIP_EDITOR_ROLES);
  return notify({
    recipients,
    type: 'contact_message_received',
    severity: 'info',
    title: `New message from ${message.name}`,
    body: message.message.slice(0, 300),
    link: null,
    dedupeKey: `contact_message:${message.id}`,
  });
}

/** The traveller set their password — the consultant chasing them can stop. */
async function portalActivated(traveller) {
  if (!traveller.createdByUserId) return { rows: [], created: 0 };
  return notify({
    recipients: [traveller.createdByUserId],
    type: 'portal_activated',
    severity: 'info',
    title: `${traveller.fullName()} signed in to the traveller app`,
    body: 'Their portal invitation has been used.',
    link: `/travellers/${traveller.id}`,
    dedupeKey: `portal:${traveller.id}:activated`,
  });
}

/**
 * Staff have asked an operator to confirm something.
 *
 * Only reaches the operator if they actually have portal access — an
 * operator with no login yet is chased by phone or email today, the same as
 * before this notification existed, and that is a fact about the operator
 * record, not an error. `notify` treats an empty recipient list as a no-op.
 */
async function operatorConfirmationRequested(confirmation, operator, actor) {
  if (!operator.portalEnabled) return { rows: [], created: 0 };
  return notify({
    recipients: [operator.id],
    recipientKind: 'operator',
    actor,
    type: 'operator_confirmation_requested',
    severity: 'info',
    title: `${actor ? actor.fullName() : 'TrailAsia'} needs a confirmation from you`,
    body: confirmation.summary,
    link: '/operator',
    dedupeKey: `operator_confirmation:${confirmation.id}:requested`,
  });
}

async function bookingCancelled(booking, actor, reason) {
  const recipients = [booking.consultantId, booking.coordinatorId].filter(Boolean);
  return notify({
    recipients,
    actor,
    type: 'booking_cancelled',
    severity: 'warning',
    title: `${booking.reference} was cancelled`,
    body: reason || booking.title,
    link: `/bookings/${booking.id}`,
    dedupeKey: `booking:${booking.id}:cancelled`,
  });
}

/**
 * Tell people their work is late.
 *
 * Run from the scheduled sweep rather than computed when somebody opens the
 * bell: a notification that only exists while you are looking at it has not
 * notified anybody. The dedupe key carries the due date, so a task that is
 * pushed out and goes late again is a new fact and gets a new row.
 */
async function notifyOverdueTasks({ now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);

  const overdue = await Task.findAll({
    where: {
      status: { [Op.in]: Task.OPEN_STATUSES },
      assignedToUserId: { [Op.ne]: null },
      dueOn: { [Op.lt]: today },
    },
  });

  let raised = 0;
  for (const task of overdue) {
    // eslint-disable-next-line no-await-in-loop
    const result = await notify({
      recipients: [task.assignedToUserId],
      type: 'task_overdue',
      severity: task.priority === 'urgent' ? 'urgent' : 'warning',
      title: 'A task of yours is overdue',
      body: `${task.title} — was due ${task.dueOn}.`,
      link: '/tasks',
      dedupeKey: `task:${task.id}:overdue:${task.dueOn}`,
    });
    raised += result.created;
  }

  return { checked: overdue.length, notified: raised };
}

// --- Reading ---------------------------------------------------------------

/**
 * This person's notifications.
 *
 * The recipient always comes from the session, never from the request — there is
 * no id here for anyone to change, which is the same reasoning as `/me`.
 */
async function list(query, user) {
  const options = parseListQuery(query, {
    sortable: ['createdAt'],
    defaultSort: 'createdAt:desc',
  });

  const where = { userId: user.id };
  if (query.status === 'unread') where.readAt = null;

  const result = await Notification.findAndCountAll({
    where,
    include: [{ model: User, as: 'actor', required: false }],
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

/** What the bell polls. Urgent is separate so the badge can shout when it should. */
async function unreadCount(user) {
  const [unread, urgent] = await Promise.all([
    Notification.count({ where: { userId: user.id, readAt: null } }),
    Notification.count({ where: { userId: user.id, readAt: null, severity: 'urgent' } }),
  ]);
  return { unread, urgent };
}

async function markRead(id, user) {
  const notification = await Notification.findOne({ where: { id, userId: user.id } });
  // Not found rather than forbidden: whether somebody else's notification exists
  // is not a question this endpoint should answer.
  if (!notification) throw ApiError.notFound('Notification not found.');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return notification;
}

async function markAllRead(user) {
  const [count] = await Notification.update(
    { readAt: new Date() },
    { where: { userId: user.id, readAt: null } }
  );
  return { marked: count };
}

/** Housekeeping: read notifications older than a while are of no use to anyone. */
async function purgeRead(olderThanDays = 60) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  return Notification.destroy({
    where: { readAt: { [Op.lt]: cutoff } },
  });
}

// --- Reading, for the other two audiences -----------------------------------
//
// Kept as their own functions rather than a `subjectType` parameter threaded
// through the four above — the same call this codebase already made for
// `travellerAuth.service.js` versus `auth.service.js`: the flows look
// similar but branching on which kind of person it is inside one function
// produces a function where every line needs re-reading to know who it
// currently means.

async function listForTraveller(query, traveller) {
  const options = parseListQuery(query, {
    sortable: ['createdAt'],
    defaultSort: 'createdAt:desc',
  });

  const where = { travellerId: traveller.id };
  if (query.status === 'unread') where.readAt = null;

  const result = await Notification.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function travellerUnreadCount(traveller) {
  const [unread, urgent] = await Promise.all([
    Notification.count({ where: { travellerId: traveller.id, readAt: null } }),
    Notification.count({ where: { travellerId: traveller.id, readAt: null, severity: 'urgent' } }),
  ]);
  return { unread, urgent };
}

async function markReadForTraveller(id, traveller) {
  const notification = await Notification.findOne({ where: { id, travellerId: traveller.id } });
  if (!notification) throw ApiError.notFound('Notification not found.');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return notification;
}

async function markAllReadForTraveller(traveller) {
  const [count] = await Notification.update(
    { readAt: new Date() },
    { where: { travellerId: traveller.id, readAt: null } }
  );
  return { marked: count };
}

async function listForOperator(query, operator) {
  const options = parseListQuery(query, {
    sortable: ['createdAt'],
    defaultSort: 'createdAt:desc',
  });

  const where = { operatorId: operator.id };
  if (query.status === 'unread') where.readAt = null;

  const result = await Notification.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

async function operatorUnreadCount(operator) {
  const [unread, urgent] = await Promise.all([
    Notification.count({ where: { operatorId: operator.id, readAt: null } }),
    Notification.count({ where: { operatorId: operator.id, readAt: null, severity: 'urgent' } }),
  ]);
  return { unread, urgent };
}

async function markReadForOperator(id, operator) {
  const notification = await Notification.findOne({ where: { id, operatorId: operator.id } });
  if (!notification) throw ApiError.notFound('Notification not found.');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return notification;
}

async function markAllReadForOperator(operator) {
  const [count] = await Notification.update(
    { readAt: new Date() },
    { where: { operatorId: operator.id, readAt: null } }
  );
  return { marked: count };
}

module.exports = {
  notify,
  staffWithRoles,
  TRIP_EDITOR_ROLES,

  sosRaised,
  sosAcknowledged,
  sosResolved,
  taskAssigned,
  tasksHandedOver,
  documentReviewed,
  documentSubmitted,
  contactMessageReceived,
  portalActivated,
  bookingCancelled,
  operatorConfirmationRequested,
  notifyOverdueTasks,

  list,
  unreadCount,
  markRead,
  markAllRead,
  purgeRead,

  listForTraveller,
  travellerUnreadCount,
  markReadForTraveller,
  markAllReadForTraveller,

  listForOperator,
  operatorUnreadCount,
  markReadForOperator,
  markAllReadForOperator,
};
