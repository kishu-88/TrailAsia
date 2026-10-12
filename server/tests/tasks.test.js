'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createTraveller,
  createBooking,
  createDestination,
  createRequirement,
  daysFromNow,
} = require('./helpers');

beforeEach(resetDatabase);

/**
 * A booking with one traveller, one itinerary segment and one mandatory visa
 * requirement that nobody has satisfied — the smallest arrangement that produces
 * a readiness gap for the generator to find.
 */
async function bookingWithGap(actor, overrides = {}) {
  const destination = await createDestination();
  const requirement = await createRequirement(destination.id, {
    type: 'visa',
    name: 'Tourist visa',
    isMandatory: true,
    leadTimeDays: 21,
  });
  const traveller = await createTraveller();
  const booking = await createBooking({
    consultantId: actor.user.id,
    travellers: [traveller],
    departureDate: daysFromNow(60),
    returnDate: daysFromNow(80),
    ...overrides,
  });
  await db.ItinerarySegment.create({
    bookingId: booking.id,
    destinationId: destination.id,
    sequence: 1,
    title: 'Kathmandu to Lukla',
    startDate: daysFromNow(60),
    endDate: daysFromNow(80),
  });
  return { booking, traveller, destination, requirement };
}

async function makeTask(actor, booking, overrides = {}) {
  const response = await actor.as('post', '/tasks').send({
    bookingId: String(booking.id),
    title: 'Confirm the Lukla flights',
    ...overrides,
  });
  if (response.status !== 201) {
    throw new Error(`Task creation failed (${response.status}): ${response.text}`);
  }
  return response.body.data.task;
}

describe('creating tasks', () => {
  it('starts open, unassigned, and with a creation event', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const task = await makeTask(actor, booking);

    expect(task.status).toBe('open');
    expect(task.isOpen).toBe(true);
    expect(task.assignee).toBeNull();
    expect(task.source).toBe('manual');

    const events = await actor.as('get', `/tasks/${task.id}/events`);
    expect(events.body.data).toHaveLength(1);
    expect(events.body.data[0].type).toBe('created');
    expect(events.body.data[0].actor.id).toBe(String(actor.user.id));
  });

  it('lets finance read the queue but not add to it', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: consultant.user.id });
    await makeTask(consultant, booking);

    const finance = await signIn({ role: 'finance' });

    // Reading is deliberately open to every role: "what is still outstanding on
    // this departure" is a reconciliation question too.
    expect((await finance.as('get', '/tasks')).status).toBe(200);
    expect(
      (await finance.as('post', '/tasks').send({ bookingId: String(booking.id), title: 'Mine now' }))
        .status
    ).toBe(403);
  });

  it('refuses a traveller who is not on the booking', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const stranger = await createTraveller();

    const response = await actor.as('post', '/tasks').send({
      bookingId: String(booking.id),
      travellerId: String(stranger.id),
      title: 'Chase a passport',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TRAVELLER_NOT_ON_BOOKING');
  });

  it('will not put trip work on a finance account', async () => {
    const actor = await signIn({ role: 'consultant' });
    const finance = await signIn({ role: 'finance' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const response = await actor.as('post', '/tasks').send({
      bookingId: String(booking.id),
      title: 'Confirm the permits',
      assignedToUserId: String(finance.user.id),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ROLE_NOT_ASSIGNABLE');
  });
});

describe('the queue', () => {
  it('puts the soonest due first and undated work last', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    await makeTask(actor, booking, { title: 'No deadline' });
    await makeTask(actor, booking, { title: 'Due in a fortnight', dueOn: daysFromNow(14) });
    await makeTask(actor, booking, { title: 'Due tomorrow', dueOn: daysFromNow(1) });

    const response = await actor.as('get', '/tasks');
    const titles = response.body.data.map((task) => task.title);

    // A NULL due date sorts first in both MySQL and SQLite, which would put
    // everything without a deadline at the top of a screen about deadlines.
    expect(titles).toEqual(['Due tomorrow', 'Due in a fortnight', 'No deadline']);
  });

  it('sorts urgent above the rest on the same day', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const due = daysFromNow(3);

    await makeTask(actor, booking, { title: 'Normal', dueOn: due });
    await makeTask(actor, booking, { title: 'Urgent', dueOn: due, priority: 'urgent' });

    const response = await actor.as('get', '/tasks');
    expect(response.body.data.map((task) => task.title)).toEqual(['Urgent', 'Normal']);
  });

  it('filters to mine, to unassigned, and to overdue', async () => {
    const actor = await signIn({ role: 'consultant' });
    const other = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const mine = await makeTask(actor, booking, {
      title: 'Mine',
      assignedToUserId: String(actor.user.id),
    });
    await makeTask(actor, booking, { title: 'Theirs', assignedToUserId: String(other.user.id) });
    await makeTask(actor, booking, { title: 'Nobody has this', dueOn: daysFromNow(-3) });

    const minesOnly = await actor.as('get', '/tasks?assignedTo=me');
    expect(minesOnly.body.data.map((task) => task.id)).toEqual([mine.id]);

    const unassigned = await actor.as('get', '/tasks?assignedTo=unassigned');
    expect(unassigned.body.data.map((task) => task.title)).toEqual(['Nobody has this']);

    const overdue = await actor.as('get', '/tasks?overdue=true');
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.data[0].overdue).toBe(true);
    expect(overdue.body.data[0].daysUntilDue).toBe(-3);
  });

  it('hides closed work unless asked for it', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);

    await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'done' });

    expect((await actor.as('get', '/tasks')).body.data).toHaveLength(0);
    expect((await actor.as('get', '/tasks?status=all')).body.data).toHaveLength(1);
    expect((await actor.as('get', '/tasks?status=done')).body.data).toHaveLength(1);
  });

  it('counts what is mine, what is late and what nobody has picked up', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    await makeTask(actor, booking, {
      title: 'Mine, late',
      assignedToUserId: String(actor.user.id),
      dueOn: daysFromNow(-2),
    });
    await makeTask(actor, booking, {
      title: 'Mine, today',
      assignedToUserId: String(actor.user.id),
      dueOn: daysFromNow(0),
    });
    await makeTask(actor, booking, { title: 'Nobody has this' });

    const response = await actor.as('get', '/tasks/summary');

    expect(response.body.data).toMatchObject({
      mine: 2,
      mineOverdue: 1,
      mineDueToday: 1,
      unassigned: 1,
      open: 3,
      overdue: 1,
    });
  });
});

describe('status', () => {
  it('records who finished it and when', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);

    const response = await actor
      .as('post', `/tasks/${task.id}/status`)
      .send({ status: 'done', note: 'Flights confirmed by the operator.' });

    expect(response.status).toBe(200);
    expect(response.body.data.task.status).toBe('done');
    expect(response.body.data.task.isOpen).toBe(false);
    expect(response.body.data.task.completedBy.id).toBe(String(actor.user.id));
    expect(response.body.data.task.completedAt).toBeTruthy();
  });

  it('will not let a person reopen a finished task', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);
    await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'done' });

    const response = await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'open' });

    // Reopening would quietly rewrite what happened. Raising a new task leaves
    // both facts on the record.
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TASK_TRANSITION');
  });

  it('needs a reason before something can be marked blocked', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);

    const without = await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'blocked' });
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe('BLOCKED_REASON_REQUIRED');

    const withReason = await actor
      .as('post', `/tasks/${task.id}/status`)
      .send({ status: 'blocked', blockedReason: 'Waiting on the operator to confirm seats.' });
    expect(withReason.body.data.task.blockedReason).toContain('Waiting on the operator');

    const unblocked = await actor
      .as('post', `/tasks/${task.id}/status`)
      .send({ status: 'in_progress' });
    expect(unblocked.body.data.task.blockedReason).toBeNull();
  });

  it('refuses edits to a closed task', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);
    await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'cancelled' });

    const response = await actor.as('patch', `/tasks/${task.id}`).send({ title: 'Something else' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TASK_CLOSED');
  });
});

describe('assignment and the trail', () => {
  it('records who moved it, from whom, to whom', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const first = await signIn({ role: 'consultant' });
    const second = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking, { assignedToUserId: String(first.user.id) });

    await actor
      .as('post', `/tasks/${task.id}/assign`)
      .send({ userId: String(second.user.id), note: 'Vishal is across this operator.' });

    const events = (await actor.as('get', `/tasks/${task.id}/events`)).body.data;
    const move = events.find((event) => event.type === 'assigned' && event.fromValue);

    expect(move.fromValue).toBe(first.user.fullName());
    expect(move.toValue).toBe(second.user.fullName());
    expect(move.note).toBe('Vishal is across this operator.');
    expect(move.actor.id).toBe(String(actor.user.id));
  });

  it('can release a task back to the unassigned pile', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking, { assignedToUserId: String(actor.user.id) });

    const response = await actor.as('post', `/tasks/${task.id}/assign`).send({ userId: null });

    expect(response.status).toBe(200);
    expect(response.body.data.task.assignee).toBeNull();
    const events = (await actor.as('get', `/tasks/${task.id}/events`)).body.data;
    expect(events.some((event) => event.type === 'unassigned')).toBe(true);
  });

  it('keeps notes and changes in one chronological thread', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const task = await makeTask(actor, booking);

    await actor.as('post', `/tasks/${task.id}/notes`).send({ note: 'Rang the operator, no answer.' });
    await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'in_progress' });

    const response = await actor.as('get', `/tasks/${task.id}`);
    const types = response.body.data.task.events.map((event) => event.type);

    expect(types).toEqual(['created', 'note', 'status_changed']);
  });
});

describe('tasks generated from readiness', () => {
  it('raises one per outstanding requirement and does not duplicate on a second run', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const { booking, traveller } = await bookingWithGap(actor);

    const first = await actor.as('post', `/bookings/${booking.id}/tasks/sync`);
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(1);

    const second = await actor.as('post', `/bookings/${booking.id}/tasks/sync`);
    expect(second.body.data.created).toBe(0);

    const tasks = (await actor.as('get', `/tasks?bookingId=${booking.id}`)).body.data;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].source).toBe('readiness');
    expect(tasks[0].title).toContain('Tourist visa');
    expect(tasks[0].travellerId).toBe(String(traveller.id));
    // Due by departure minus the requirement's lead time, same as the checklist.
    expect(tasks[0].dueOn).toBe(daysFromNow(39));
    expect(tasks[0].createdBy).toBeUndefined();
  });

  it('leaves the assignee and status a person set alone', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const { booking } = await bookingWithGap(actor);

    await actor.as('post', `/bookings/${booking.id}/tasks/sync`);
    const task = (await actor.as('get', `/tasks?bookingId=${booking.id}`)).body.data[0];

    await actor.as('post', `/tasks/${task.id}/assign`).send({ userId: String(actor.user.id) });
    await actor.as('post', `/tasks/${task.id}/status`).send({ status: 'in_progress' });

    await actor.as('post', `/bookings/${booking.id}/tasks/sync`);

    // A generated task is a prompt, not something the platform owns. Once
    // somebody has picked it up, resyncing must not take it back off them.
    const after = (await actor.as('get', `/tasks/${task.id}`)).body.data.task;
    expect(after.assignee.id).toBe(String(actor.user.id));
    expect(after.status).toBe('in_progress');
  });

  it('closes itself once the document is on file', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const { booking, traveller, destination } = await bookingWithGap(actor);

    await actor.as('post', `/bookings/${booking.id}/tasks/sync`);

    await db.TravellerDocument.create({
      travellerId: traveller.id,
      destinationId: destination.id,
      type: 'visa',
      reference: 'V-99887',
      status: 'verified',
      expiresOn: daysFromNow(200),
    });

    const response = await actor.as('post', `/bookings/${booking.id}/tasks/sync`);
    expect(response.body.data.closed).toBe(1);

    const task = (await actor.as('get', `/tasks?bookingId=${booking.id}&status=all`)).body.data[0];
    expect(task.status).toBe('done');
    // Closed by the platform, not by whoever happened to trigger the sync.
    expect(task.completedBy).toBeUndefined();

    const events = (await actor.as('get', `/tasks/${task.id}/events`)).body.data;
    const closure = events.find((event) => event.toValue === 'done');
    expect(closure.actor).toBeNull();
    expect(closure.note).toContain('Closed automatically');
  });

  it('reopens itself if the gap comes back', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const { booking, traveller, destination } = await bookingWithGap(actor);

    await actor.as('post', `/bookings/${booking.id}/tasks/sync`);
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      destinationId: destination.id,
      type: 'visa',
      status: 'verified',
      expiresOn: daysFromNow(200),
    });
    await actor.as('post', `/bookings/${booking.id}/tasks/sync`);

    // The visa expired. A person cannot reopen a closed task; the platform
    // reporting a fact that is true again is a different thing, and it says so.
    await document.update({ expiresOn: daysFromNow(-1) });
    const response = await actor.as('post', `/bookings/${booking.id}/tasks/sync`);

    expect(response.body.data.reopened).toBe(1);
    const task = (await actor.as('get', `/tasks?bookingId=${booking.id}`)).body.data[0];
    expect(task.status).toBe('open');
    expect(task.completedAt).toBeNull();
  });

  it('is not something finance can trigger', async () => {
    const coordinator = await signIn({ role: 'coordinator' });
    const { booking } = await bookingWithGap(coordinator);
    const finance = await signIn({ role: 'finance' });

    expect((await finance.as('post', `/bookings/${booking.id}/tasks/sync`)).status).toBe(403);
  });
});

describe('handover', () => {
  it('moves only open work, only that person’s, and records why', async () => {
    const admin = await signIn({ role: 'admin' });
    const away = await signIn({ role: 'consultant' });
    const cover = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: away.user.id });

    const open = await makeTask(admin, booking, {
      title: 'Chase the permits',
      assignedToUserId: String(away.user.id),
    });
    const finished = await makeTask(admin, booking, {
      title: 'Already done',
      assignedToUserId: String(away.user.id),
    });
    const someoneElses = await makeTask(admin, booking, {
      title: 'Not hers',
      assignedToUserId: String(cover.user.id),
    });
    await admin.as('post', `/tasks/${finished.id}/status`).send({ status: 'done' });

    const response = await admin.as('post', '/tasks/handover').send({
      fromUserId: String(away.user.id),
      toUserId: String(cover.user.id),
      note: 'Kishor is on leave until the 30th.',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.moved).toBe(1);

    const moved = (await admin.as('get', `/tasks/${open.id}`)).body.data.task;
    expect(moved.assignee.id).toBe(String(cover.user.id));

    const events = (await admin.as('get', `/tasks/${open.id}/events`)).body.data;
    const handover = events.find((event) => event.type === 'handover');
    expect(handover.note).toBe('Kishor is on leave until the 30th.');
    expect(handover.fromValue).toBe(away.user.fullName());

    // A handover is about work still to do. Rewriting who finished something
    // last month would be a lie.
    const untouched = (await admin.as('get', `/tasks/${finished.id}`)).body.data.task;
    expect(untouched.completedBy.id).toBe(String(admin.user.id));
    const other = (await admin.as('get', `/tasks/${someoneElses.id}`)).body.data.task;
    expect(other.assignee.id).toBe(String(cover.user.id));
    expect(
      (await admin.as('get', `/tasks/${someoneElses.id}/events`)).body.data.some(
        (event) => event.type === 'handover'
      )
    ).toBe(false);
  });

  it('can be scoped to a single booking', async () => {
    const admin = await signIn({ role: 'admin' });
    const away = await signIn({ role: 'consultant' });
    const cover = await signIn({ role: 'coordinator' });
    const nepal = await createBooking({ consultantId: away.user.id, title: 'Nepal' });
    const bhutan = await createBooking({ consultantId: away.user.id, title: 'Bhutan' });

    const onNepal = await makeTask(admin, nepal, { assignedToUserId: String(away.user.id) });
    const onBhutan = await makeTask(admin, bhutan, { assignedToUserId: String(away.user.id) });

    const response = await admin.as('post', '/tasks/handover').send({
      fromUserId: String(away.user.id),
      toUserId: String(cover.user.id),
      bookingId: String(nepal.id),
    });

    expect(response.body.data.moved).toBe(1);
    expect((await admin.as('get', `/tasks/${onNepal.id}`)).body.data.task.assignee.id).toBe(
      String(cover.user.id)
    );
    expect((await admin.as('get', `/tasks/${onBhutan.id}`)).body.data.task.assignee.id).toBe(
      String(away.user.id)
    );
  });

  it('refuses the same person, and refuses handing work to finance', async () => {
    const admin = await signIn({ role: 'admin' });
    const away = await signIn({ role: 'consultant' });
    const finance = await signIn({ role: 'finance' });

    const same = await admin
      .as('post', '/tasks/handover')
      .send({ fromUserId: String(away.user.id), toUserId: String(away.user.id) });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('HANDOVER_NO_OP');

    const toFinance = await admin
      .as('post', '/tasks/handover')
      .send({ fromUserId: String(away.user.id), toUserId: String(finance.user.id) });
    expect(toFinance.status).toBe(400);
    expect(toFinance.body.error.code).toBe('ROLE_NOT_ASSIGNABLE');
  });

  it('shows what somebody is carrying before anything is moved', async () => {
    const admin = await signIn({ role: 'admin' });
    const away = await signIn({ role: 'consultant' });
    const nepal = await createBooking({ consultantId: away.user.id });
    const bhutan = await createBooking({ consultantId: away.user.id });

    await makeTask(admin, nepal, {
      assignedToUserId: String(away.user.id),
      dueOn: daysFromNow(-1),
    });
    await makeTask(admin, bhutan, { assignedToUserId: String(away.user.id) });

    const response = await admin.as('get', `/tasks/workload/${away.user.id}`);

    expect(response.body.data).toMatchObject({ total: 2, overdue: 1, bookings: 2 });
    expect(response.body.data.user.id).toBe(String(away.user.id));
  });
});
