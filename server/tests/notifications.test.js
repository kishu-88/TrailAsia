'use strict';

const {
  db,
  resetDatabase,
  signIn,
  signInTraveller,
  createTraveller,
  createBooking,
  createDestination,
  createRequirement,
  daysFromNow,
} = require('./helpers');

const notificationService = require('../src/services/notification.service');
const taskReminders = require('../src/jobs/taskReminders');
const mailerService = require('../src/services/mailer.service');

beforeEach(resetDatabase);

async function inboxOf(actor, query = '') {
  const response = await actor.as('get', `/notifications${query}`);
  return response.body.data;
}

describe('the inbox', () => {
  it('is empty to start with, and only ever yours', async () => {
    const me = await signIn({ role: 'consultant' });
    const someoneElse = await signIn({ role: 'consultant' });

    await db.Notification.create({
      userId: someoneElse.user.id,
      type: 'task_assigned',
      title: 'Not for you',
    });

    expect(await inboxOf(me)).toHaveLength(0);
    expect(await inboxOf(someoneElse)).toHaveLength(1);
  });

  it('counts unread, and counts urgent separately', async () => {
    const me = await signIn({ role: 'coordinator' });

    await db.Notification.bulkCreate([
      { userId: me.user.id, type: 'task_assigned', title: 'One', severity: 'info' },
      { userId: me.user.id, type: 'sos_raised', title: 'Two', severity: 'urgent' },
      { userId: me.user.id, type: 'task_overdue', title: 'Read already', readAt: new Date() },
    ]);

    const response = await me.as('get', '/notifications/unread-count');

    // Urgent is its own number so the badge can shout when it should and stay
    // quiet when it should not.
    expect(response.body.data).toEqual({ unread: 2, urgent: 1 });
  });

  it('filters to unread', async () => {
    const me = await signIn({ role: 'coordinator' });
    await db.Notification.bulkCreate([
      { userId: me.user.id, type: 'task_assigned', title: 'Unread' },
      { userId: me.user.id, type: 'task_assigned', title: 'Read', readAt: new Date() },
    ]);

    const unread = await inboxOf(me, '?status=unread');
    expect(unread.map((row) => row.title)).toEqual(['Unread']);
  });

  it('marks one as read, and refuses somebody else’s', async () => {
    const me = await signIn({ role: 'coordinator' });
    const someoneElse = await signIn({ role: 'coordinator' });

    const mine = await db.Notification.create({
      userId: me.user.id,
      type: 'task_assigned',
      title: 'Mine',
    });
    const theirs = await db.Notification.create({
      userId: someoneElse.user.id,
      type: 'task_assigned',
      title: 'Theirs',
    });

    const ok = await me.as('post', `/notifications/${mine.id}/read`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.notification.read).toBe(true);

    // Not found rather than forbidden — whether somebody else's notification
    // exists is not a question this endpoint should answer.
    expect((await me.as('post', `/notifications/${theirs.id}/read`)).status).toBe(404);
  });

  it('marks everything read at once', async () => {
    const me = await signIn({ role: 'coordinator' });
    await db.Notification.bulkCreate([
      { userId: me.user.id, type: 'task_assigned', title: 'One' },
      { userId: me.user.id, type: 'task_assigned', title: 'Two' },
    ]);

    const response = await me.as('post', '/notifications/read-all');

    expect(response.body.data.marked).toBe(2);
    expect((await me.as('get', '/notifications/unread-count')).body.data.unread).toBe(0);
  });
});

describe('an SOS', () => {
  async function partyOnATrip() {
    const traveller = await signInTraveller();
    const booking = await createBooking({ travellers: [traveller.traveller] });
    return { traveller, booking };
  }

  it('reaches every trip editor, urgently', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const admin = await signIn({ role: 'admin' });
    const finance = await signIn({ role: 'finance' });
    const { traveller, booking } = await partyOnATrip();

    await traveller.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });

    for (const actor of [consultant, coordinator, admin]) {
      // eslint-disable-next-line no-await-in-loop
      const inbox = await inboxOf(actor);
      expect(inbox).toHaveLength(1);
      expect(inbox[0].type).toBe('sos_raised');
      expect(inbox[0].severity).toBe('urgent');
      expect(inbox[0].link).toBe('/safety');
      // Raised by a traveller, not by a member of staff.
      expect(inbox[0].actor).toBeNull();
    }

    // Finance can read the safety desk but does not get paged by it — they
    // cannot acknowledge or resolve, so a bell they cannot act on is noise.
    expect(await inboxOf(finance)).toHaveLength(0);
  });

  it('does not raise a second notification when the button is pressed again', async () => {
    const coordinator = await signIn({ role: 'coordinator' });
    const { traveller, booking } = await partyOnATrip();

    await traveller.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });
    await traveller.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });

    expect(await inboxOf(coordinator)).toHaveLength(1);
  });

  it('tells the office when somebody picks it up — except the person who did', async () => {
    const watching = await signIn({ role: 'consultant' });
    const responder = await signIn({ role: 'coordinator' });
    const { traveller, booking } = await partyOnATrip();

    const raised = await traveller
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id) });
    await responder.as('post', `/safety/alerts/${raised.body.data.id}/acknowledge`);

    const watcher = await inboxOf(watching);
    expect(watcher.map((row) => row.type)).toEqual(
      expect.arrayContaining(['sos_raised', 'sos_acknowledged'])
    );
    expect(watcher.find((row) => row.type === 'sos_acknowledged').actor.id).toBe(
      String(responder.user.id)
    );

    // The responder hears about the SOS, but not about their own acknowledgement.
    const responderInbox = await inboxOf(responder);
    expect(responderInbox.map((row) => row.type)).toEqual(['sos_raised']);
  });
});

describe('tasks', () => {
  it('tells somebody when work lands on them, and says nothing when they take it themselves', async () => {
    const giver = await signIn({ role: 'coordinator' });
    const receiver = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: giver.user.id });

    const created = await giver.as('post', '/tasks').send({
      bookingId: String(booking.id),
      title: 'Confirm the Lukla flights',
      assignedToUserId: String(receiver.user.id),
    });

    const inbox = await inboxOf(receiver);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].type).toBe('task_assigned');
    expect(inbox[0].body).toBe('Confirm the Lukla flights');
    expect(inbox[0].actor.id).toBe(String(giver.user.id));

    // Taking an unassigned task is the common case, and a bell that rings
    // because you clicked something teaches people to ignore it.
    const own = await giver.as('post', '/tasks').send({
      bookingId: String(booking.id),
      title: 'Mine',
      assignedToUserId: String(giver.user.id),
    });
    expect(own.status).toBe(201);
    expect(await inboxOf(giver)).toHaveLength(0);
    expect(created.status).toBe(201);
  });

  it('sends one notification for a whole handover, not one per task', async () => {
    const admin = await signIn({ role: 'admin' });
    const away = await signIn({ role: 'consultant' });
    const cover = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: away.user.id });

    for (const title of ['One', 'Two', 'Three']) {
      // eslint-disable-next-line no-await-in-loop
      await admin.as('post', '/tasks').send({
        bookingId: String(booking.id),
        title,
        assignedToUserId: String(away.user.id),
      });
    }
    await cover.as('post', '/notifications/read-all');

    await admin.as('post', '/tasks/handover').send({
      fromUserId: String(away.user.id),
      toUserId: String(cover.user.id),
      note: 'Kishor is on leave until the 30th.',
    });

    const inbox = await inboxOf(cover, '?status=unread');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].type).toBe('task_handover');
    expect(inbox[0].title).toBe('3 tasks handed to you');
    expect(inbox[0].body).toBe('Kishor is on leave until the 30th.');
  });

  it('nudges the owner of an overdue task once, not once per sweep', async () => {
    const admin = await signIn({ role: 'admin' });
    const owner = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: owner.user.id });

    await admin.as('post', '/tasks').send({
      bookingId: String(booking.id),
      title: 'Chase the permits',
      assignedToUserId: String(owner.user.id),
      dueOn: daysFromNow(-3),
    });
    await owner.as('post', '/notifications/read-all');

    const first = await taskReminders.run();
    expect(first.peopleNotified).toBe(1);

    // A task sitting overdue for a fortnight is one fact, not fourteen.
    const second = await taskReminders.run();
    expect(second.peopleNotified).toBe(0);

    const inbox = await inboxOf(owner, '?status=unread');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].type).toBe('task_overdue');
    expect(inbox[0].actor).toBeNull();
  });

  it('leaves unowned overdue work alone — there is nobody to tell', async () => {
    const admin = await signIn({ role: 'admin' });
    const booking = await createBooking({ consultantId: admin.user.id });
    await admin.as('post', '/tasks').send({
      bookingId: String(booking.id),
      title: 'Nobody has this',
      dueOn: daysFromNow(-5),
    });

    const result = await taskReminders.run();
    expect(result.peopleNotified).toBe(0);
  });
});

describe('documents and portal access', () => {
  it('tells the person who entered the record when it is verified', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    await createRequirement(destination.id, { type: 'visa', name: 'Tourist visa' });

    const created = await consultant.as('post', '/travellers').send({
      firstName: 'Ang',
      lastName: 'Dorje',
      email: 'ang.dorje@example.com',
    });
    const travellerId = created.body.data.traveller.id;

    const document = await consultant.as('post', `/travellers/${travellerId}/documents`).send({
      type: 'visa',
      reference: 'V-1234',
      destinationId: String(destination.id),
      expiresOn: daysFromNow(200),
    });

    await coordinator
      .as('post', `/travellers/${travellerId}/documents/${document.body.data.document.id}/verify`)
      .send({ approved: true });

    // Verification is deliberately somebody else's job, so the consultant would
    // otherwise have to keep checking whether it had happened.
    const inbox = await inboxOf(consultant);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].type).toBe('document_verified');
    expect(inbox[0].actor.id).toBe(String(coordinator.user.id));
    expect(inbox[0].link).toBe(`/travellers/${travellerId}`);

    // The traveller gets their own copy — a recipient-polymorphic row keyed
    // on travellerId rather than userId — so they learn about it without
    // having to ask their consultant.
    const travellerCopy = await db.Notification.findOne({ where: { travellerId } });
    expect(travellerCopy).not.toBeNull();
    expect(travellerCopy.type).toBe('document_verified');
    expect(travellerCopy.userId).toBeNull();
    expect(travellerCopy.link).toBe('/my-trip');
  });

  it('tells the traveller why, when their document is rejected', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const created = await consultant.as('post', '/travellers').send({
      firstName: 'Tenzin',
      lastName: 'Sherpa',
      email: 'tenzin.sherpa@example.com',
    });
    const travellerId = created.body.data.traveller.id;

    const document = await consultant.as('post', `/travellers/${travellerId}/documents`).send({
      type: 'insurance',
      reference: 'POL-1',
      expiresOn: daysFromNow(200),
    });

    await coordinator
      .as('post', `/travellers/${travellerId}/documents/${document.body.data.document.id}/verify`)
      .send({ approved: false, notes: 'Scan is unreadable, please resend.' });

    const travellerCopy = await db.Notification.findOne({ where: { travellerId } });
    expect(travellerCopy.type).toBe('document_rejected');
    expect(travellerCopy.body).toContain('Scan is unreadable, please resend.');
  });

  it('tells the consultant when their traveller activates the portal', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const created = await consultant.as('post', '/travellers').send({
      firstName: 'Mira',
      lastName: 'Sun',
      email: 'mira.sun@example.com',
    });
    const travellerId = created.body.data.traveller.id;

    const invite = await consultant.as('post', `/travellers/${travellerId}/portal-invite`);
    await consultant.as('post', '/notifications/read-all');

    const { anon } = require('./helpers');
    await anon('post', '/auth/traveller/activate').send({
      token: invite.body.data.inviteToken,
      password: 'a-long-enough-password',
    });

    const inbox = await inboxOf(consultant, '?status=unread');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].type).toBe('portal_activated');
  });
});

describe('a cancelled booking', () => {
  it('reaches the consultant and coordinator, but not whoever cancelled it', async () => {
    const consultant = await signIn({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const admin = await signIn({ role: 'admin' });

    const booking = await createBooking({ consultantId: consultant.user.id });
    await booking.update({ coordinatorId: coordinator.user.id });

    await admin
      .as('post', `/bookings/${booking.id}/cancel`)
      .send({ reason: 'Client postponed to next season.' });

    for (const actor of [consultant, coordinator]) {
      // eslint-disable-next-line no-await-in-loop
      const inbox = await inboxOf(actor);
      expect(inbox).toHaveLength(1);
      expect(inbox[0].type).toBe('booking_cancelled');
      expect(inbox[0].body).toBe('Client postponed to next season.');
    }

    expect(await inboxOf(admin)).toHaveLength(0);
  });
});

describe('failure handling', () => {
  it('does not break the action it was raised for', async () => {
    const giver = await signIn({ role: 'coordinator' });
    const receiver = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: giver.user.id });

    const original = db.Notification.create;
    db.Notification.create = () => Promise.reject(new Error('notifications are on fire'));

    try {
      const response = await giver.as('post', '/tasks').send({
        bookingId: String(booking.id),
        title: 'Still has to work',
        assignedToUserId: String(receiver.user.id),
      });

      // The whole design rests on this: a bug in the bell must never stop an
      // SOS being raised or a task being assigned.
      expect(response.status).toBe(201);
      expect(response.body.data.task.assignee.id).toBe(String(receiver.user.id));
    } finally {
      db.Notification.create = original;
    }

    expect(await inboxOf(receiver)).toHaveLength(0);
  });

  it('never notifies a deactivated account', async () => {
    const active = await signIn({ role: 'coordinator' });
    const { user: dormant } = await require('./helpers').createUser({
      role: 'consultant',
      isActive: false,
    });
    const traveller = await createTraveller();
    const booking = await createBooking({ travellers: [traveller] });
    const session = await signInTraveller();
    await db.BookingTraveller.create({ bookingId: booking.id, travellerId: session.traveller.id });

    await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });

    expect(await db.Notification.count({ where: { userId: dormant.id } })).toBe(0);
    expect(await db.Notification.count({ where: { userId: active.user.id } })).toBe(1);
  });
});

describe('email delivery', () => {
  // The Mailgun call itself is tested in mailer.test.js. Here we only check
  // that notify() reaches it for the right people at the right times — the
  // part that is specific to this file.
  let sendEmail;

  beforeEach(() => {
    sendEmail = jest.spyOn(mailerService, 'sendEmail').mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    sendEmail.mockRestore();
  });

  it('emails a newly-created notification to the recipient', async () => {
    const me = await signIn({ role: 'coordinator' });

    await notificationService.notify({
      recipients: [me.user.id],
      type: 'task_assigned',
      title: 'A task for you',
      body: 'Details here.',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: me.user.email,
        subject: 'A task for you',
        text: 'Details here.',
      })
    );
  });

  it('does not re-email a dedupe hit', async () => {
    const me = await signIn({ role: 'coordinator' });

    await notificationService.notify({
      recipients: [me.user.id],
      type: 'task_overdue',
      title: 'Overdue',
      dedupeKey: 'task:1:overdue:2026-01-01',
    });
    await notificationService.notify({
      recipients: [me.user.id],
      type: 'task_overdue',
      title: 'Overdue',
      dedupeKey: 'task:1:overdue:2026-01-01',
    });

    // Two calls into notify() with the same dedupeKey is one notification
    // row and must be one email, not two — the whole point of a dedupe key
    // is that a repeated sweep finding the same fact is silent.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('emails a traveller recipient at their own address, not a staff one', async () => {
    const traveller = await createTraveller({ email: 'traveller-email-test@example.com' });

    await notificationService.notify({
      recipients: [traveller.id],
      recipientKind: 'traveller',
      type: 'document_verified',
      title: 'Your visa was verified',
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'traveller-email-test@example.com' })
    );
  });

  it('never throws, and still reports the notification as created, when Mailgun fails', async () => {
    sendEmail.mockRejectedValue(new Error('Mailgun is down'));
    const me = await signIn({ role: 'coordinator' });

    const result = await notificationService.notify({
      recipients: [me.user.id],
      type: 'task_assigned',
      title: 'Still works',
    });

    // The in-app notification is the real thing; the email is a courtesy.
    // A broken mailer must never make notify() look like it did nothing.
    expect(result.created).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(await db.Notification.count({ where: { userId: me.user.id } })).toBe(1);
  });

  it('skips a recipient with no email on file rather than failing the rest', async () => {
    const withEmail = await signIn({ role: 'coordinator' });
    const withoutEmail = await signIn({ role: 'coordinator' });
    // A raw update bypasses the model's own `allowNull: false` on email —
    // standing in here for an existing record from before email was
    // required, or any other way a blank slips through in production data.
    await db.sequelize.query('UPDATE users SET email = ? WHERE id = ?', {
      replacements: ['', withoutEmail.user.id],
    });

    await notificationService.notify({
      recipients: [withEmail.user.id, withoutEmail.user.id],
      type: 'task_assigned',
      title: 'Broadcast',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: withEmail.user.email }));
  });
});

describe('housekeeping', () => {
  it('clears out read notifications once they are months old', async () => {
    const me = await signIn({ role: 'coordinator' });
    const old = new Date(Date.now() - 90 * 86400000);

    await db.Notification.create({
      userId: me.user.id,
      type: 'task_assigned',
      title: 'Ancient and read',
      readAt: old,
    });
    await db.Notification.create({
      userId: me.user.id,
      type: 'task_assigned',
      title: 'Ancient and unread',
    });

    const purged = await notificationService.purgeRead(60);

    // Unread stays, however old. Nobody has seen it, so deleting it would be
    // the platform deciding on their behalf that it did not matter.
    expect(purged).toBe(1);
    const left = await inboxOf(me);
    expect(left.map((row) => row.title)).toEqual(['Ancient and unread']);
  });
});
