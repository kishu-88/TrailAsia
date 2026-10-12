'use strict';

const {
  db,
  resetDatabase,
  signIn,
  signInTraveller,
  createTraveller,
  createBooking,
  daysFromNow,
} = require('./helpers');

const purgeJob = require('../src/jobs/purgeLocations');
const escalationJob = require('../src/jobs/sosEscalation');

beforeEach(resetDatabase);

const KATHMANDU = { latitude: 27.717245, longitude: 85.32396 };

async function tripFor(session, overrides = {}) {
  return createBooking({ travellers: [session.traveller], ...overrides });
}

async function grantConsent(session, booking) {
  return session
    .as('post', '/safety/me/consent')
    .send({ bookingId: String(booking.id), granted: true });
}

describe('location consent', () => {
  it('starts switched off', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    const response = await session.as('get', `/safety/me?bookingId=${booking.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.consent.granted).toBe(false);
    expect(response.body.data.lastSeen).toBeNull();
    expect(response.body.data.retentionDays).toBe(30);
  });

  it('records the wording the traveller agreed to', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    const response = await grantConsent(session, booking);

    expect(response.status).toBe(200);
    expect(response.body.data.granted).toBe(true);
    expect(response.body.data.consentStatement).toContain('deleted after the trip ends');
  });

  it('refuses a position when sharing is off', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    const response = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(booking.id), ...KATHMANDU });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('LOCATION_CONSENT_REQUIRED');
    expect(await db.LocationPing.count()).toBe(0);
  });

  it('accepts a position once sharing is on', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    await grantConsent(session, booking);

    const response = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(booking.id), ...KATHMANDU, altitudeMetres: 1400, batteryPercent: 42 });

    expect(response.status).toBe(201);
    expect(response.body.data.latitude).toBeCloseTo(27.717245, 5);
    expect(response.body.data.batteryPercent).toBe(42);
    expect(response.body.data.stored).toBe(true);
  });

  it('folds a ping that arrives too soon into the previous one', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    await grantConsent(session, booking);

    await session.as('post', '/safety/me/pings').send({ bookingId: String(booking.id), ...KATHMANDU });
    const second = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(booking.id), latitude: 27.7173, longitude: 85.324 });

    // Not an error — the client is behaving correctly and there is nothing for
    // it to fix, so it gets a 202 and one row stays one row.
    expect(second.status).toBe(202);
    expect(second.body.data.stored).toBe(false);
    expect(await db.LocationPing.count()).toBe(1);
  });

  it('stops collecting when consent is withdrawn, and keeps what was already collected', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    await grantConsent(session, booking);
    await session.as('post', '/safety/me/pings').send({ bookingId: String(booking.id), ...KATHMANDU });

    const withdrawn = await session
      .as('post', '/safety/me/consent')
      .send({ bookingId: String(booking.id), granted: false });
    expect(withdrawn.body.data.granted).toBe(false);

    const blocked = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(booking.id), ...KATHMANDU });

    expect(blocked.status).toBe(403);
    // Withdrawal stops future collection. It does not erase records that were
    // lawfully collected; those go on the ordinary retention schedule.
    expect(await db.LocationPing.count()).toBe(1);
  });

  it('refuses a position for a trip the traveller is not on', async () => {
    const session = await signInTraveller();
    const stranger = await createTraveller();
    const theirTrip = await createBooking({ travellers: [stranger] });

    const response = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(theirTrip.id), ...KATHMANDU });

    expect(response.status).toBe(404);
  });

  it('rejects coordinates that are not on Earth', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    await grantConsent(session, booking);

    const response = await session
      .as('post', '/safety/me/pings')
      .send({ bookingId: String(booking.id), latitude: 127.7, longitude: 85.3 });

    expect(response.status).toBe(400);
    expect(response.body.error.details.latitude).toBeTruthy();
  });
});

describe('SOS', () => {
  it('is never blocked by missing consent', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    const response = await session
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id), ...KATHMANDU, message: 'Injured on the pass' });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('raised');
    expect(response.body.data.message).toBe('Injured on the pass');
  });

  it('works with no position at all', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    // A phone with no fix must still be able to raise one. Requiring
    // coordinates would fail exactly the alerts that matter most.
    const response = await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });

    expect(response.status).toBe(201);
    expect(response.body.data.latitude).toBeNull();
  });

  it('does not create a second alert when the button is pressed again', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    const first = await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });
    const second = await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await db.SosAlert.count()).toBe(1);
  });

  it('does not record an SOS position as a location ping', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);

    await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id), ...KATHMANDU });

    // The position belongs to the incident record, not to location tracking —
    // which is why an SOS does not require consent and does not start sharing.
    expect(await db.LocationPing.count()).toBe(0);
    const summary = await session.as('get', `/safety/me?bookingId=${booking.id}`);
    expect(summary.body.data.consent.granted).toBe(false);
    expect(summary.body.data.openAlert).not.toBeNull();
  });

  it('lets a traveller cancel their own alert but not somebody else’s', async () => {
    const mine = await signInTraveller();
    const theirs = await signInTraveller();
    const myTrip = await tripFor(mine);
    const theirTrip = await tripFor(theirs);

    const myAlert = await mine.as('post', '/safety/me/sos').send({ bookingId: String(myTrip.id) });
    const theirAlert = await theirs
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(theirTrip.id) });

    const cancelled = await mine.as('post', `/safety/me/sos/${myAlert.body.data.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');

    const forbidden = await mine.as('post', `/safety/me/sos/${theirAlert.body.data.id}/cancel`);
    expect(forbidden.status).toBe(404);
  });
});

describe('the staff side of an alert', () => {
  async function raisedAlert() {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    const response = await session
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id), ...KATHMANDU });
    return { session, booking, alert: response.body.data };
  }

  it('is visible to every staff role, finance included', async () => {
    const { alert } = await raisedAlert();
    const finance = await signIn({ role: 'finance' });

    const response = await finance.as('get', '/safety/alerts?status=open');

    // Wider than anything else in the codebase, and deliberate: an alert at 2am
    // must reach whoever is actually at a desk.
    expect(response.status).toBe(200);
    expect(response.body.data.map((row) => row.id)).toContain(alert.id);
    expect(response.body.data[0].traveller.emergencyContact).toBeDefined();
  });

  it('cannot be acknowledged by finance', async () => {
    const { alert } = await raisedAlert();
    const finance = await signIn({ role: 'finance' });

    const response = await finance.as('post', `/safety/alerts/${alert.id}/acknowledge`);

    expect(response.status).toBe(403);
  });

  it('records who acknowledged it and when', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    const response = await coordinator.as('post', `/safety/alerts/${alert.id}/acknowledge`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('acknowledged');
    expect(response.body.data.acknowledgedBy.id).toBe(String(coordinator.user.id));
    expect(response.body.data.isOpen).toBe(true);
  });

  it('will not close without an account of what happened', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    const response = await coordinator.as('post', `/safety/alerts/${alert.id}/resolve`).send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details.notes).toBeTruthy();
  });

  it('closes with notes and refuses to close twice', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    const resolved = await coordinator
      .as('post', `/safety/alerts/${alert.id}/resolve`)
      .send({ notes: 'Spoke to the guide; traveller evacuated to Lukla and is well.' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect(resolved.body.data.isOpen).toBe(false);
    expect(resolved.body.data.resolvedBy.id).toBe(String(coordinator.user.id));

    const again = await coordinator
      .as('post', `/safety/alerts/${alert.id}/resolve`)
      .send({ notes: 'Closing again' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALERT_CLOSED');
  });

  it('lists open alerts before closed ones, oldest first', async () => {
    const { alert: older } = await raisedAlert();
    const { alert: newer } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    await coordinator
      .as('post', `/safety/alerts/${older.id}/resolve`)
      .send({ notes: 'False alarm, confirmed by phone.' });

    const response = await coordinator.as('get', '/safety/alerts');

    expect(response.body.data[0].id).toBe(newer.id);
    expect(response.body.data[0].isOpen).toBe(true);
  });
});

describe('assigning an alert', () => {
  async function raisedAlert() {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    const response = await session
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id), ...KATHMANDU });
    return { session, booking, alert: response.body.data };
  }

  it('hands it to a named coordinator, notifying them but not the person who assigned it', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });
    const admin = await signIn({ role: 'admin' });

    const response = await admin
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTo.id).toBe(String(coordinator.user.id));
    expect(response.body.data.assignedBy.id).toBe(String(admin.user.id));
    expect(response.body.data.isUnclaimed).toBe(false);

    const theirs = await coordinator.as('get', '/notifications');
    expect(theirs.body.data.some((row) => row.type === 'sos_assigned')).toBe(true);

    const adminsOwn = await admin.as('get', '/notifications');
    expect(adminsOwn.body.data.some((row) => row.type === 'sos_assigned')).toBe(false);
  });

  it('can be assigned to yourself with no notification, since nobody needs telling what they just did', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    const response = await coordinator
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTo.id).toBe(String(coordinator.user.id));

    const own = await coordinator.as('get', '/notifications');
    expect(own.body.data.some((row) => row.type === 'sos_assigned')).toBe(false);
  });

  it('refuses an assignee who is not an active trip editor', async () => {
    const { alert } = await raisedAlert();
    const admin = await signIn({ role: 'admin' });
    const finance = await signIn({ role: 'finance' });

    const response = await admin
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(finance.user.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.details.userId).toBeTruthy();
  });

  it('unassigns with userId: null', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });
    const admin = await signIn({ role: 'admin' });

    await admin
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    const response = await admin
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: null });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTo).toBeNull();
    expect(response.body.data.isUnclaimed).toBe(true);
  });

  it('cannot be assigned by finance', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });
    const finance = await signIn({ role: 'finance' });

    const response = await finance
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(403);
  });

  it('refuses to assign an alert that is already closed', async () => {
    const { alert } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    await coordinator
      .as('post', `/safety/alerts/${alert.id}/resolve`)
      .send({ notes: 'False alarm, confirmed by phone.' });

    const response = await coordinator
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ALERT_CLOSED');
  });
});

describe('SOS escalation sweep', () => {
  async function raisedAlert() {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    const response = await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });
    return { session, booking, alert: response.body.data };
  }

  it('leaves a freshly raised, unclaimed alert alone', async () => {
    await raisedAlert();
    const result = await escalationJob.run({ now: new Date() });
    expect(result.escalated).toBe(0);
  });

  it('notifies every trip editor once the escalation window has passed', async () => {
    const { session } = await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });
    const later = new Date(Date.now() + 6 * 60000); // past the 5-minute default

    const result = await escalationJob.run({ now: later });

    expect(result.escalated).toBe(1);
    expect(result.peopleNotified).toBeGreaterThan(0);

    const theirs = await coordinator.as('get', '/notifications');
    const row = theirs.body.data.find((n) => n.type === 'sos_escalated');
    expect(row).toBeTruthy();
    expect(row.title).toContain(session.traveller.fullName());
  });

  it('does not escalate an alert that has been assigned, even though it is still "raised"', async () => {
    const { alert } = await raisedAlert();
    const admin = await signIn({ role: 'admin' });
    const coordinator = await signIn({ role: 'coordinator' });

    await admin
      .as('post', `/safety/alerts/${alert.id}/assign`)
      .send({ userId: String(coordinator.user.id) });

    const later = new Date(Date.now() + 6 * 60000);
    const result = await escalationJob.run({ now: later });

    expect(result.escalated).toBe(0);
  });

  it('escalates again at the next interval rather than staying silent', async () => {
    await raisedAlert();
    const coordinator = await signIn({ role: 'coordinator' });

    const first = new Date(Date.now() + 6 * 60000);
    const firstRun = await escalationJob.run({ now: first });
    expect(firstRun.peopleNotified).toBeGreaterThan(0);

    // Same level (still between 5 and 10 minutes) — no new notification.
    const sameLevel = new Date(Date.now() + 9 * 60000);
    const secondRun = await escalationJob.run({ now: sameLevel });
    expect(secondRun.peopleNotified).toBe(0);

    // Past the next interval — a new fact, a new notification.
    const nextLevel = new Date(Date.now() + 11 * 60000);
    const thirdRun = await escalationJob.run({ now: nextLevel });
    expect(thirdRun.peopleNotified).toBeGreaterThan(0);

    const theirs = await coordinator.as('get', '/notifications?perPage=50');
    const escalations = theirs.body.data.filter((n) => n.type === 'sos_escalated');
    expect(escalations).toHaveLength(2);
  });
});

describe('the SOS log', () => {
  async function raisedAlert(extra = {}) {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    const response = await session
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id), ...extra });
    return { session, booking, alert: response.body.data };
  }

  async function historyOf(actor, alert) {
    const response = await actor.as('get', `/safety/alerts/${alert.id}/events`);
    expect(response.status).toBe(200);
    return response.body.data;
  }

  it('records the whole life of an alert, in order, with who did each thing', async () => {
    const { session, alert } = await raisedAlert({
      ...KATHMANDU,
      message: 'Twisted ankle above Namche',
    });
    const admin = await signIn({ role: 'admin', firstName: 'Asha', lastName: 'Admin' });
    const coordinator = await signIn({ role: 'coordinator', firstName: 'Maya', lastName: 'Gurung' });

    await admin.as('post', `/safety/alerts/${alert.id}/assign`).send({ userId: String(coordinator.user.id) });
    await coordinator.as('post', `/safety/alerts/${alert.id}/acknowledge`);
    await admin.as('post', `/safety/alerts/${alert.id}/assign`).send({ userId: null });
    await coordinator
      .as('post', `/safety/alerts/${alert.id}/resolve`)
      .send({ notes: 'Guide reached them, walking down.' });

    const events = await historyOf(admin, alert);

    expect(events.map((event) => event.type)).toEqual([
      'raised',
      'assigned',
      'acknowledged',
      'unassigned',
      'resolved',
    ]);
    expect(events[0]).toMatchObject({
      actor: { kind: 'traveller', name: session.traveller.fullName() },
      detail: 'Position sent. Note: "Twisted ankle above Namche"',
    });
    expect(events[1]).toMatchObject({
      actor: { kind: 'staff', name: 'Asha Admin' },
      detail: 'To Maya Gurung',
    });
    expect(events[2].actor).toEqual({ kind: 'staff', name: 'Maya Gurung' });
    // The alert row no longer knows who had it. This entry is the only place
    // that still does, which is the reason the log exists.
    expect(events[3]).toMatchObject({
      actor: { kind: 'staff', name: 'Asha Admin' },
      detail: 'Was with Maya Gurung',
    });
    expect(events[4]).toMatchObject({
      actor: { kind: 'staff', name: 'Maya Gurung' },
      detail: 'Guide reached them, walking down.',
    });
  });

  it('says when an alert was raised with no position', async () => {
    const { alert } = await raisedAlert();
    const admin = await signIn({ role: 'admin' });

    const [raised] = await historyOf(admin, alert);

    expect(raised.detail).toBe('No position sent.');
  });

  it('does not log a second "raised" when the button is pressed again', async () => {
    const { session, booking, alert } = await raisedAlert();
    await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });
    await session.as('post', '/safety/me/sos').send({ bookingId: String(booking.id) });
    const admin = await signIn({ role: 'admin' });

    const events = await historyOf(admin, alert);

    expect(events.map((event) => event.type)).toEqual(['raised']);
  });

  it('records a traveller withdrawing their own alert', async () => {
    const { session, alert } = await raisedAlert();
    await session.as('post', `/safety/me/sos/${alert.id}/cancel`);
    const admin = await signIn({ role: 'admin' });

    const events = await historyOf(admin, alert);

    expect(events.map((event) => event.type)).toEqual(['raised', 'cancelled']);
    expect(events[1].actor).toEqual({ kind: 'traveller', name: session.traveller.fullName() });
  });

  it('logs an escalation once per level, not once per run of the sweep', async () => {
    const { alert } = await raisedAlert();
    const admin = await signIn({ role: 'admin' });
    const raisedAt = new Date(alert.raisedAt).getTime();
    const minutes = (count) => new Date(raisedAt + count * 60000);

    await escalationJob.run({ now: minutes(6) });
    await escalationJob.run({ now: minutes(7) });
    await escalationJob.run({ now: minutes(8) });
    await escalationJob.run({ now: minutes(11) });

    const escalations = (await historyOf(admin, alert)).filter(
      (event) => event.type === 'escalated'
    );

    // Four runs, two levels (5 and 10 minutes), two entries.
    expect(escalations).toHaveLength(2);
    expect(escalations[0].actor).toEqual({ kind: 'system', name: null });
    expect(escalations[0].detail).toMatch(/^Unclaimed for 6 minutes\. \d+ (person|people) notified\.$/);
    expect(escalations[1].detail).toMatch(/^Unclaimed for 11 minutes\./);
  });

  it('never lets a failure to write the log stop an SOS', async () => {
    const create = jest
      .spyOn(db.SosAlertEvent, 'create')
      .mockRejectedValue(new Error('log table is on fire'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const session = await signInTraveller();
    const booking = await tripFor(session);
    const response = await session
      .as('post', '/safety/me/sos')
      .send({ bookingId: String(booking.id), ...KATHMANDU });

    create.mockRestore();
    error.mockRestore();

    // The alert is the thing. Its paperwork is not allowed to prevent it.
    expect(response.status).toBe(201);
    expect(await db.SosAlert.count()).toBe(1);
  });

  it('is readable by every staff role and by no traveller', async () => {
    const { session, alert } = await raisedAlert();

    for (const role of ['consultant', 'coordinator', 'finance', 'admin']) {
      // eslint-disable-next-line no-await-in-loop
      const actor = await signIn({ role });
      // eslint-disable-next-line no-await-in-loop
      expect((await actor.as('get', '/safety/events')).status).toBe(200);
      // eslint-disable-next-line no-await-in-loop
      expect((await actor.as('get', `/safety/alerts/${alert.id}/events`)).status).toBe(200);
    }

    expect((await session.as('get', '/safety/events')).status).toBe(401);
    expect((await session.as('get', `/safety/alerts/${alert.id}/events`)).status).toBe(401);
  });

  describe('across every alert', () => {
    it('lists newest first and says whose alert each entry is about', async () => {
      const first = await raisedAlert();
      const second = await raisedAlert();
      const admin = await signIn({ role: 'admin' });
      await admin.as('post', `/safety/alerts/${first.alert.id}/acknowledge`);

      const response = await admin.as('get', '/safety/events');

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(3);
      const [latest] = response.body.data;
      expect(latest.type).toBe('acknowledged');
      expect(latest.alert).toMatchObject({
        id: String(first.alert.id),
        status: 'acknowledged',
        traveller: { fullName: first.session.traveller.fullName() },
        booking: { reference: first.booking.reference },
      });
      // No coordinates anywhere in the log — only whether one was sent.
      expect(JSON.stringify(response.body)).not.toMatch(/latitude|longitude/);
      expect(response.body.data.map((event) => event.alertId)).toContain(String(second.alert.id));
    });

    it('filters by type and by alert, and paginates', async () => {
      const first = await raisedAlert();
      const second = await raisedAlert();
      const admin = await signIn({ role: 'admin' });
      await admin.as('post', `/safety/alerts/${first.alert.id}/acknowledge`);
      await admin
        .as('post', `/safety/alerts/${first.alert.id}/resolve`)
        .send({ notes: 'False alarm, confirmed by phone.' });

      const byType = await admin.as('get', '/safety/events?type=raised');
      expect(byType.body.data).toHaveLength(2);
      expect(byType.body.data.every((event) => event.type === 'raised')).toBe(true);

      const byAlert = await admin.as('get', `/safety/events?alertId=${second.alert.id}`);
      expect(byAlert.body.data.map((event) => event.type)).toEqual(['raised']);

      const paged = await admin.as('get', '/safety/events?perPage=2&page=2');
      expect(paged.body.data).toHaveLength(2);
      expect(paged.body.meta).toMatchObject({ page: 2, perPage: 2, total: 4, totalPages: 2 });

      expect((await admin.as('get', '/safety/events?type=exploded')).status).toBe(400);
    });
  });
});

describe('where the party is', () => {
  it('lists everyone, including those who are not sharing', async () => {
    const sharing = await signInTraveller();
    const notSharing = await createTraveller();
    const booking = await createBooking({ travellers: [sharing.traveller, notSharing] });

    await grantConsent(sharing, booking);
    await sharing.as('post', '/safety/me/pings').send({ bookingId: String(booking.id), ...KATHMANDU });

    const coordinator = await signIn({ role: 'coordinator' });
    const response = await coordinator.as('get', `/safety/bookings/${booking.id}/locations`);

    expect(response.status).toBe(200);
    expect(response.body.data.party).toHaveLength(2);

    const rows = Object.fromEntries(
      response.body.data.party.map((row) => [row.traveller.id, row])
    );
    expect(rows[String(sharing.traveller.id)].sharing).toBe(true);
    expect(rows[String(sharing.traveller.id)].lastSeen.latitude).toBeCloseTo(27.717245, 5);

    // Present, and visibly not sharing. Omitting them would let a coordinator
    // read "not on the list" as "accounted for".
    expect(rows[String(notSharing.id)].sharing).toBe(false);
    expect(rows[String(notSharing.id)].lastSeen).toBeNull();
    expect(rows[String(notSharing.id)].consentStatus).toBe('not_asked');
  });

  it('is not open to finance', async () => {
    const session = await signInTraveller();
    const booking = await tripFor(session);
    const finance = await signIn({ role: 'finance' });

    const response = await finance.as('get', `/safety/bookings/${booking.id}/locations`);

    expect(response.status).toBe(403);
  });
});

describe('retention', () => {
  it('deletes location records once a trip is long over, and keeps current ones', async () => {
    const past = await signInTraveller();
    const current = await signInTraveller();

    const finished = await createBooking({
      travellers: [past.traveller],
      departureDate: daysFromNow(-120),
      returnDate: daysFromNow(-100),
    });
    const ongoing = await createBooking({
      travellers: [current.traveller],
      departureDate: daysFromNow(-2),
      returnDate: daysFromNow(19),
    });

    await grantConsent(past, finished);
    await grantConsent(current, ongoing);
    await past.as('post', '/safety/me/pings').send({ bookingId: String(finished.id), ...KATHMANDU });
    await current.as('post', '/safety/me/pings').send({ bookingId: String(ongoing.id), ...KATHMANDU });
    await past.as('post', '/safety/me/sos').send({ bookingId: String(finished.id) });

    expect(await db.LocationPing.count()).toBe(2);

    const result = await purgeJob.run();

    expect(result.pingsDeleted).toBe(1);
    expect(await db.LocationPing.count()).toBe(1);
    expect(
      await db.LocationPing.count({ where: { bookingId: ongoing.id } })
    ).toBe(1);

    // The incident record outlives the location data on purpose: it is not
    // tracking, and an SOS is exactly what somebody reviews months later.
    expect(await db.SosAlert.count()).toBe(1);
  });

  it('leaves a trip with no dates alone rather than guessing', async () => {
    const session = await signInTraveller();
    const booking = await createBooking({
      travellers: [session.traveller],
      departureDate: null,
      returnDate: null,
    });
    await grantConsent(session, booking);
    await session.as('post', '/safety/me/pings').send({ bookingId: String(booking.id), ...KATHMANDU });

    const result = await purgeJob.run();

    expect(result.pingsDeleted).toBe(0);
    expect(await db.LocationPing.count()).toBe(1);
  });
});
