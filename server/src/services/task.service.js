'use strict';

const { Op } = require('sequelize');

const {
  Booking,
  BookingTraveller,
  Task,
  TaskEvent,
  Traveller,
  TravellerDocument,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const bookingService = require('./booking.service');
const notificationService = require('./notification.service');

/**
 * The shared work queue.
 *
 * Two things in here are worth understanding before changing anything.
 *
 * **Generated tasks.** The document checklist already knows a visa is outstanding
 * and due in nine days. Making a consultant notice that by hand, and then type it
 * into a task list, is asking a person to do a computer's job badly. `sync`
 * turns readiness gaps into tasks and closes them again when the gap is filled,
 * keyed on `sourceKey` so running it twice changes nothing.
 *
 * **Events.** Every assignment, status change and note is appended to
 * `task_events` in the same transaction as the change itself. A handover that is
 * not recorded is a conversation, and a conversation is what this module exists
 * to replace.
 */

const SORTABLE = ['dueOn', 'createdAt', 'priority', 'status', 'title'];

const DETAIL_INCLUDE = [
  { model: Booking, as: 'booking', required: false },
  { model: Traveller, as: 'traveller', required: false },
  { model: TravellerDocument, as: 'document', required: false },
  { model: User, as: 'assignee', required: false },
  { model: User, as: 'createdBy', required: false },
  { model: User, as: 'completedBy', required: false },
];

/** Roles a task may be assigned to. Finance reads the queue; it does not own work. */
const ASSIGNABLE_ROLES = ['consultant', 'coordinator', 'admin'];

// --- Helpers ---------------------------------------------------------------

async function logEvent(taskId, type, { actor = null, from, to, note } = {}, transaction) {
  return TaskEvent.create(
    {
      taskId,
      type,
      actorUserId: actor ? actor.id : null,
      fromValue: from === undefined || from === null ? null : String(from),
      toValue: to === undefined || to === null ? null : String(to),
      note: note || null,
    },
    { transaction }
  );
}

async function assertBooking(bookingId) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) {
    throw ApiError.badRequest('That booking does not exist.', {
      code: 'INVALID_BOOKING',
      details: { bookingId: 'Not found.' },
    });
  }
  return booking;
}

async function assertAssignee(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const user = await User.findByPk(userId);
  if (!user || !user.isActive) {
    throw ApiError.badRequest('That person does not have an active account.', {
      code: 'INVALID_ASSIGNEE',
      details: { assignedToUserId: 'Not found, or deactivated.' },
    });
  }
  if (!ASSIGNABLE_ROLES.includes(user.role)) {
    throw ApiError.badRequest(
      `${user.fullName()} is ${user.role} and does not take ownership of trip work.`,
      { code: 'ROLE_NOT_ASSIGNABLE', details: { assignedToUserId: 'Not an assignable role.' } }
    );
  }
  return user;
}

async function getById(id, { withEvents = false } = {}) {
  const task = await Task.findByPk(id, {
    include: withEvents
      ? [
          ...DETAIL_INCLUDE,
          {
            model: TaskEvent,
            as: 'events',
            required: false,
            include: [{ model: User, as: 'actor', required: false }],
          },
        ]
      : DETAIL_INCLUDE,
    order: withEvents ? [[{ model: TaskEvent, as: 'events' }, 'createdAt', 'ASC']] : undefined,
  });
  if (!task) throw ApiError.notFound('Task not found.');
  return task;
}

// --- Listing ---------------------------------------------------------------

/**
 * The queue.
 *
 * Ordering is the whole product here: soonest due first, undated work last, and
 * urgent above the rest at the same date. Both halves are CASE expressions
 * rather than a plain `ORDER BY` because an ENUM sorts by declaration order in
 * MySQL and alphabetically in SQLite, and NULL due dates sort *first* ascending
 * in both — which would put everything without a deadline at the top of a screen
 * whose entire purpose is showing what is due.
 *
 * Unlike the alerts list, these expressions are safe in SQL: no table in the
 * join carries a `due_on` or `priority` column, so neither name is ambiguous.
 */
async function list(query, actingUser) {
  const options = parseListQuery(query, { sortable: SORTABLE, defaultSort: 'dueOn:asc' });
  const where = {};

  if (query.bookingId) where.bookingId = query.bookingId;
  if (query.travellerId) where.travellerId = query.travellerId;
  if (query.documentId) where.documentId = query.documentId;
  if (query.category) where.category = query.category;
  if (query.priority) where.priority = query.priority;

  // `status=open` means the three live states, not literally 'open'. It is what
  // somebody means when they ask what is outstanding.
  if (query.status === 'open' || query.status === undefined || query.status === '') {
    where.status = { [Op.in]: Task.OPEN_STATUSES };
  } else if (query.status !== 'all') {
    where.status = query.status;
  }

  if (query.assignedTo === 'me') where.assignedToUserId = actingUser.id;
  else if (query.assignedTo === 'unassigned') where.assignedToUserId = null;
  else if (query.assignedTo) where.assignedToUserId = query.assignedTo;

  const today = new Date().toISOString().slice(0, 10);
  if (['1', 'true', 'yes'].includes(String(query.overdue).toLowerCase())) {
    where.dueOn = { [Op.lt]: today };
    where.status = { [Op.in]: Task.OPEN_STATUSES };
  } else if (query.dueBefore) {
    where.dueOn = { [Op.lte]: query.dueBefore };
  }

  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [{ title: { [Op.like]: term } }, { description: { [Op.like]: term } }];
  }

  const order =
    options.order[0][0] === 'dueOn'
      ? [
          [sequelize.literal('CASE WHEN due_on IS NULL THEN 1 ELSE 0 END'), 'ASC'],
          ['dueOn', options.order[0][1]],
          [
            sequelize.literal(
              "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END"
            ),
            'ASC',
          ],
          ['createdAt', 'ASC'],
        ]
      : options.order;

  const result = await Task.findAndCountAll({
    where,
    include: DETAIL_INCLUDE,
    limit: options.limit,
    offset: options.offset,
    order,
  });

  return paginated(result, options, (task) => task.toPublicJSON());
}

/**
 * Counts for the dashboard and the queue's filter chips.
 *
 * "Unassigned" is deliberately the headline number alongside "mine". Work nobody
 * owns is the failure mode a shared queue is supposed to make visible, and it is
 * invisible on a screen that only ever shows you your own list.
 */
async function summary(actingUser) {
  const today = new Date().toISOString().slice(0, 10);
  const open = { [Op.in]: Task.OPEN_STATUSES };

  const [mine, mineOverdue, mineDueToday, unassigned, openTotal, overdueTotal] =
    await Promise.all([
      Task.count({ where: { status: open, assignedToUserId: actingUser.id } }),
      Task.count({
        where: { status: open, assignedToUserId: actingUser.id, dueOn: { [Op.lt]: today } },
      }),
      Task.count({ where: { status: open, assignedToUserId: actingUser.id, dueOn: today } }),
      Task.count({ where: { status: open, assignedToUserId: null } }),
      Task.count({ where: { status: open } }),
      Task.count({ where: { status: open, dueOn: { [Op.lt]: today } } }),
    ]);

  return {
    mine,
    mineOverdue,
    mineDueToday,
    unassigned,
    open: openTotal,
    overdue: overdueTotal,
  };
}

// --- Writing ---------------------------------------------------------------

async function create(payload, actingUser) {
  await assertBooking(payload.bookingId);

  if (payload.travellerId) {
    const membership = await BookingTraveller.findOne({
      where: { bookingId: payload.bookingId, travellerId: payload.travellerId },
    });
    if (!membership) {
      throw ApiError.badRequest('That traveller is not on this booking.', {
        code: 'TRAVELLER_NOT_ON_BOOKING',
        details: { travellerId: 'Not part of this booking.' },
      });
    }
  }

  const assignee = await assertAssignee(payload.assignedToUserId);

  const task = await sequelize.transaction(async (transaction) => {
    const created = await Task.create(
      {
        bookingId: payload.bookingId,
        travellerId: payload.travellerId || null,
        title: payload.title,
        description: payload.description || null,
        category: payload.category || 'other',
        priority: payload.priority || 'normal',
        dueOn: payload.dueOn || null,
        assignedToUserId: assignee ? assignee.id : null,
        createdByUserId: actingUser.id,
        source: 'manual',
      },
      { transaction }
    );

    await logEvent(created.id, 'created', { actor: actingUser }, transaction);
    if (assignee) {
      await logEvent(
        created.id,
        'assigned',
        { actor: actingUser, to: assignee.fullName() },
        transaction
      );
    }
    return created;
  });

  // Outside the transaction: a failed notification must not undo the task.
  if (assignee) await notificationService.taskAssigned(task, assignee, actingUser);

  return getById(task.id);
}

const EDITABLE = ['title', 'description', 'category', 'priority', 'dueOn', 'travellerId'];

async function update(id, changes, actingUser) {
  const task = await getById(id);

  if (!task.isOpen()) {
    throw ApiError.badRequest('This task is closed and cannot be edited.', {
      code: 'TASK_CLOSED',
    });
  }

  const applied = {};
  for (const field of EDITABLE) {
    if (changes[field] !== undefined && String(changes[field]) !== String(task[field])) {
      applied[field] = changes[field];
    }
  }

  if (Object.keys(applied).length === 0) return task;

  await sequelize.transaction(async (transaction) => {
    await task.update(applied, { transaction });
    await logEvent(
      task.id,
      'edited',
      { actor: actingUser, note: `Changed ${Object.keys(applied).join(', ')}.` },
      transaction
    );
  });

  return getById(id);
}

/**
 * Assign, reassign or release a task.
 *
 * `userId: null` puts it back in the unassigned pile, which is a legitimate move
 * and not the same as cancelling it.
 */
async function assign(id, { userId, note }, actingUser) {
  const task = await getById(id);

  if (!task.isOpen()) {
    throw ApiError.badRequest('This task is closed.', { code: 'TASK_CLOSED' });
  }

  const assignee = await assertAssignee(userId);
  const previous = task.assignee ? task.assignee.fullName() : null;

  if (String(task.assignedToUserId || '') === String(assignee ? assignee.id : '')) {
    return task;
  }

  await sequelize.transaction(async (transaction) => {
    await task.update({ assignedToUserId: assignee ? assignee.id : null }, { transaction });
    await logEvent(
      task.id,
      assignee ? 'assigned' : 'unassigned',
      { actor: actingUser, from: previous, to: assignee ? assignee.fullName() : null, note },
      transaction
    );
  });

  // `notify` drops the actor from the audience, so taking a task yourself
  // correctly tells nobody.
  if (assignee) await notificationService.taskAssigned(task, assignee, actingUser);

  return getById(id);
}

async function changeStatus(id, { status, note, blockedReason }, actingUser) {
  const task = await getById(id);

  if (!Task.canTransition(task.status, status)) {
    throw ApiError.badRequest(
      task.isOpen()
        ? `A task cannot go from ${task.status} to ${status}.`
        : 'This task is already closed. Raise a new one rather than reopening it.',
      {
        code: 'INVALID_TASK_TRANSITION',
        details: { status: `Allowed: ${(Task.ALLOWED_TRANSITIONS[task.status] || []).join(', ') || 'none'}` },
      }
    );
  }

  if (status === 'blocked' && !blockedReason) {
    // "Blocked" with no reason is indistinguishable from abandoned, and it is
    // the state most likely to still be there in a month.
    throw ApiError.badRequest('Say what it is blocked on.', {
      code: 'BLOCKED_REASON_REQUIRED',
      details: { blockedReason: 'Required when blocking a task.' },
    });
  }

  const previous = task.status;
  const values = { status };
  if (status === 'blocked') values.blockedReason = blockedReason;
  if (previous === 'blocked' && status !== 'blocked') values.blockedReason = null;
  if (status === 'done') {
    values.completedAt = new Date();
    values.completedByUserId = actingUser.id;
  }

  await sequelize.transaction(async (transaction) => {
    await task.update(values, { transaction });
    await logEvent(
      task.id,
      'status_changed',
      { actor: actingUser, from: previous, to: status, note: note || blockedReason },
      transaction
    );
  });

  return getById(id);
}

async function addNote(id, note, actingUser) {
  const task = await getById(id);
  await logEvent(task.id, 'note', { actor: actingUser, note });
  return getById(id, { withEvents: true });
}

async function listEvents(id) {
  await getById(id);
  return TaskEvent.findAll({
    where: { taskId: id },
    include: [{ model: User, as: 'actor', required: false }],
    order: [['createdAt', 'ASC']],
  });
}

// --- Document review assignment ---------------------------------------------

/**
 * Hand one submitted document to a specific person to review.
 *
 * Reuses the same queue rather than inventing a second "who's looking at
 * this" mechanism next to it: the task shows up in that person's `/tasks`
 * list and on the booking's Tasks panel exactly like any other work, with
 * the same assignment notification (`task_assigned`) and the same event
 * trail. A document can only have one *open* review task at a time —
 * calling this again while one is still open reassigns it (and logs that as
 * a reassignment) rather than piling up duplicates for the same document.
 *
 * `bookingId` is resolved automatically when the traveller has exactly one
 * live (non-cancelled) booking, since that is true for the overwhelming
 * majority of documents — a traveller with more than one open trip has to
 * say which one this document review belongs to on the Tasks panel.
 */
async function assignDocumentReviewer(documentId, { userId, bookingId, note }, actingUser) {
  const document = await TravellerDocument.findByPk(documentId);
  if (!document) throw ApiError.notFound('Document not found.');

  let resolvedBookingId = bookingId || null;
  if (resolvedBookingId) {
    const membership = await BookingTraveller.findOne({
      where: { bookingId: resolvedBookingId, travellerId: document.travellerId },
    });
    if (!membership) {
      throw ApiError.badRequest('That traveller is not on this booking.', {
        code: 'TRAVELLER_NOT_ON_BOOKING',
        details: { bookingId: 'Not part of this booking.' },
      });
    }
  } else {
    // BookingTraveller has no association back to Booking (it only exists as
    // the through-table for Booking<->Traveller), so the bookings are looked
    // up by id in a second query rather than via an include.
    const memberships = await BookingTraveller.findAll({
      where: { travellerId: document.travellerId },
    });
    const bookings = await Booking.findAll({
      where: { id: memberships.map((membership) => membership.bookingId) },
    });
    const live = bookings.filter((booking) => booking.status !== 'cancelled');

    if (live.length === 0) {
      throw ApiError.badRequest('This traveller is not on any active booking yet.', {
        code: 'NO_ACTIVE_BOOKING',
      });
    }
    if (live.length > 1) {
      throw ApiError.badRequest(
        'This traveller is on more than one active booking — say which one this review belongs to.',
        { code: 'BOOKING_REQUIRED', details: { bookingId: 'Required — more than one active booking.' } }
      );
    }
    resolvedBookingId = live[0].id;
  }

  const traveller = await Traveller.findByPk(document.travellerId);
  const assignee = await assertAssignee(userId);
  if (!assignee) {
    throw ApiError.badRequest('Choose who should review this.', {
      code: 'VALIDATION_ERROR',
      details: { userId: 'Required.' },
    });
  }

  const existing = await Task.findOne({
    where: { documentId: document.id, status: { [Op.in]: Task.OPEN_STATUSES } },
  });

  if (existing) {
    return assign(existing.id, { userId, note }, actingUser);
  }

  const task = await sequelize.transaction(async (transaction) => {
    const created = await Task.create(
      {
        bookingId: resolvedBookingId,
        travellerId: document.travellerId,
        documentId: document.id,
        title: `Review ${document.type.replace('_', ' ')} — ${traveller.fullName()}`,
        category: 'documents',
        priority: 'normal',
        assignedToUserId: assignee.id,
        createdByUserId: actingUser.id,
        source: 'manual',
      },
      { transaction }
    );
    await logEvent(created.id, 'created', { actor: actingUser, note }, transaction);
    await logEvent(
      created.id,
      'assigned',
      { actor: actingUser, to: assignee.fullName() },
      transaction
    );
    return created;
  });

  await notificationService.taskAssigned(task, assignee, actingUser);
  return getById(task.id);
}

/**
 * Close a document's open review task, if it has one.
 *
 * Called from `traveller.service.js#verifyDocument` — mirrors how
 * `syncFromReadiness` closes a readiness-generated task the moment its gap
 * is filled. `actingUser` is the same person who just verified/rejected the
 * document, so the event trail reads as one action rather than two.
 */
async function closeDocumentReviewTask(documentId, actingUser) {
  const task = await Task.findOne({
    where: { documentId, status: { [Op.in]: Task.OPEN_STATUSES } },
  });
  if (!task) return null;
  return changeStatus(task.id, { status: 'done', note: 'Document was reviewed.' }, actingUser);
}

// --- Generated from readiness ----------------------------------------------

function priorityForGap(item) {
  if (item.overdue) return 'urgent';
  if (!item.dueBy) return 'normal';
  const days = Math.round(
    (new Date(`${item.dueBy}T00:00:00Z`).getTime() - Date.now()) / 86400000
  );
  return days <= 14 ? 'high' : 'normal';
}

/**
 * Turn a booking's outstanding document requirements into tasks, and close the
 * ones whose gap has since been filled.
 *
 * Idempotent: `sourceKey` identifies the gap, not the run. Calling this every
 * morning produces the same queue it produced yesterday, plus whatever actually
 * changed.
 *
 * What it deliberately does **not** touch on an existing task: the assignee, the
 * status a person set, and any note they added. A generated task is a prompt,
 * not a thing the platform owns — once somebody has picked it up, the platform's
 * job is to keep the due date honest and then get out of the way.
 */
async function syncFromReadiness(bookingId, actingUser) {
  const booking = await assertBooking(bookingId);
  const readiness = await bookingService.readiness(bookingId);

  const desired = new Map();
  for (const checklist of readiness.travellers) {
    for (const item of checklist.items) {
      if (!item.requirement.isMandatory || item.satisfied) continue;
      const key = `readiness:${checklist.traveller.id}:${item.requirement.id}`;
      desired.set(key, {
        sourceKey: key,
        bookingId: booking.id,
        travellerId: checklist.traveller.id,
        title: `${item.requirement.name} — ${checklist.traveller.fullName}`,
        description:
          item.issues.length > 0
            ? item.issues.join(' ')
            : `${item.requirement.name} has not been received for ${item.destination.name}.`,
        category: 'documents',
        priority: priorityForGap(item),
        dueOn: item.dueBy || null,
      });
    }
  }

  const existing = await Task.findAll({
    where: { bookingId: booking.id, source: 'readiness' },
  });
  const byKey = new Map(existing.map((task) => [task.sourceKey, task]));

  const result = { created: 0, updated: 0, closed: 0, reopened: 0 };

  await sequelize.transaction(async (transaction) => {
    for (const [key, values] of desired) {
      const task = byKey.get(key);

      if (!task) {
        const created = await Task.create(
          { ...values, source: 'readiness', createdByUserId: null },
          { transaction }
        );
        await logEvent(
          created.id,
          'created',
          { note: 'Raised automatically from the document checklist.' },
          transaction
        );
        result.created += 1;
        continue;
      }

      if (task.isOpen()) {
        const changes = {};
        if (String(task.dueOn || '') !== String(values.dueOn || '')) changes.dueOn = values.dueOn;
        if (task.priority !== values.priority) changes.priority = values.priority;
        if (task.description !== values.description) changes.description = values.description;
        if (Object.keys(changes).length > 0) {
          await task.update(changes, { transaction });
          result.updated += 1;
        }
        continue;
      }

      // The gap came back — a document expired, or a verified one was edited and
      // lost its tick. A person cannot reopen a closed task (see
      // ALLOWED_TRANSITIONS), and that rule is about people rewriting history.
      // This is the platform reporting a fact that is true again, and it says so
      // in the trail rather than quietly flipping a status.
      await task.update(
        {
          status: 'open',
          completedAt: null,
          completedByUserId: null,
          dueOn: values.dueOn,
          priority: values.priority,
          description: values.description,
        },
        { transaction }
      );
      await logEvent(
        task.id,
        'status_changed',
        {
          from: 'done',
          to: 'open',
          note: 'Reopened automatically — this requirement is outstanding again.',
        },
        transaction
      );
      result.reopened += 1;
    }

    for (const task of existing) {
      if (desired.has(task.sourceKey) || !task.isOpen()) continue;
      await task.update(
        { status: 'done', completedAt: new Date(), completedByUserId: null },
        { transaction }
      );
      await logEvent(
        task.id,
        'status_changed',
        {
          from: task.status,
          to: 'done',
          note: 'Closed automatically — the requirement is now satisfied.',
        },
        transaction
      );
      result.closed += 1;
    }
  });

  return { ...result, booking: readiness.booking, summary: readiness.summary };
}

// --- Handover --------------------------------------------------------------

/**
 * Move one person's open work to another, in one go, with a reason.
 *
 * This is the leave-and-illness case the business case describes: a consultant
 * is away and their bookings become unreachable because everything about them
 * was in that person's head. Reassigning tasks one at a time works and nobody
 * does it, so it happens verbally and is lost.
 *
 * Closed tasks are left where they are. A handover is about work still to do;
 * rewriting who finished something last month would be a lie.
 */
async function handover({ fromUserId, toUserId, bookingId, note }, actingUser) {
  const from = await User.findByPk(fromUserId);
  if (!from) throw ApiError.notFound('That person does not exist.');

  const to = await assertAssignee(toUserId);
  if (!to) {
    throw ApiError.badRequest('Choose who is taking the work on.', {
      code: 'HANDOVER_TARGET_REQUIRED',
      details: { toUserId: 'Required.' },
    });
  }
  if (String(from.id) === String(to.id)) {
    throw ApiError.badRequest('That is the same person.', { code: 'HANDOVER_NO_OP' });
  }

  const where = {
    assignedToUserId: from.id,
    status: { [Op.in]: Task.OPEN_STATUSES },
  };
  if (bookingId) where.bookingId = bookingId;

  const tasks = await Task.findAll({ where });

  if (tasks.length === 0) {
    return { moved: 0, from: from.toPublicJSON(), to: to.toPublicJSON(), tasks: [] };
  }

  await sequelize.transaction(async (transaction) => {
    for (const task of tasks) {
      await task.update({ assignedToUserId: to.id }, { transaction });
      await logEvent(
        task.id,
        'handover',
        {
          actor: actingUser,
          from: from.fullName(),
          to: to.fullName(),
          note: note || `Handed over from ${from.fullName()} to ${to.fullName()}.`,
        },
        transaction
      );
    }
  });

  const moved = await Task.findAll({
    where: { id: { [Op.in]: tasks.map((task) => task.id) } },
    include: DETAIL_INCLUDE,
  });

  // One notification for the handover, not one per task. Twelve bells for one
  // decision is noise, and noise is how a bell stops being read.
  await notificationService.tasksHandedOver(to, moved.length, actingUser, note);

  return {
    moved: moved.length,
    from: from.toPublicJSON(),
    to: to.toPublicJSON(),
    tasks: moved.map((task) => task.toPublicJSON()),
  };
}

/** What somebody is currently carrying — the preview shown before a handover. */
async function workload(userId) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('That person does not exist.');

  const tasks = await Task.findAll({
    where: { assignedToUserId: user.id, status: { [Op.in]: Task.OPEN_STATUSES } },
    include: DETAIL_INCLUDE,
    order: [['dueOn', 'ASC']],
  });

  const today = new Date().toISOString().slice(0, 10);

  return {
    user: user.toPublicJSON(),
    total: tasks.length,
    overdue: tasks.filter((task) => task.dueOn && task.dueOn < today).length,
    bookings: [...new Set(tasks.map((task) => String(task.bookingId)))].length,
    tasks: tasks.map((task) => task.toPublicJSON()),
  };
}

module.exports = {
  ASSIGNABLE_ROLES,
  list,
  summary,
  getById,
  create,
  update,
  assign,
  changeStatus,
  addNote,
  listEvents,
  syncFromReadiness,
  handover,
  workload,
  assignDocumentReviewer,
  closeDocumentReviewTask,
};
