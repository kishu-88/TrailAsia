'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createDestination,
  createTraveller,
  createBooking,
  daysFromNow,
} = require('./helpers');

beforeEach(resetDatabase);

/** A vetted, active operator ready to be given work. */
async function createOperator(destinationId, overrides = {}) {
  return db.Operator.create({
    name: overrides.name || 'Himalayan Ascents',
    destinationId,
    type: overrides.type || 'full_service',
    contactEmail: overrides.contactEmail || 'ops@himalayanascents.example',
    typicalResponseDays: overrides.typicalResponseDays ?? 3,
    vettedAt: overrides.vettedAt === undefined ? new Date() : overrides.vettedAt,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...('vettedByUserId' in overrides ? { vettedByUserId: overrides.vettedByUserId } : {}),
  });
}

describe('permissions', () => {
  it('lets every staff role read the directory', async () => {
    const destination = await createDestination();
    await createOperator(destination.id);
    const finance = await signIn({ role: 'finance' });
    expect((await finance.as('get', '/operators')).status).toBe(200);
  });

  it('refuses a consultant creating an operator', async () => {
    const destination = await createDestination();
    const actor = await signIn({ role: 'consultant' });

    const response = await actor
      .as('post', '/operators')
      .send({ name: 'New Partner', destinationId: String(destination.id) });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('allows a coordinator to create one', async () => {
    const destination = await createDestination();
    const actor = await signIn({ role: 'coordinator' });

    const response = await actor.as('post', '/operators').send({
      name: 'Namche Lodges',
      destinationId: String(destination.id),
      type: 'accommodation',
      contactEmail: 'Stay@Namche.example',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.operator.contactEmail).toBe('stay@namche.example');
    expect(response.body.data.operator.isVetted).toBe(false);
  });

  it('refuses finance raising a confirmation', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const consultant = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: consultant.user.id });
    const finance = await signIn({ role: 'finance' });

    const response = await finance.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides for the trek',
    });

    expect(response.status).toBe(403);
  });
});

describe('directory', () => {
  it('refuses a duplicate name for the same destination', async () => {
    const destination = await createDestination();
    await createOperator(destination.id, { name: 'Himalayan Ascents' });
    const actor = await signIn({ role: 'coordinator' });

    const response = await actor
      .as('post', '/operators')
      .send({ name: 'Himalayan Ascents', destinationId: String(destination.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OPERATOR_EXISTS');
  });

  it('allows the same name in a different country', async () => {
    const nepal = await createDestination({ code: 'NP', name: 'Nepal' });
    const bhutan = await createDestination({ code: 'BT', name: 'Bhutan' });
    await createOperator(nepal.id, { name: 'Summit Logistics' });
    const actor = await signIn({ role: 'coordinator' });

    const response = await actor
      .as('post', '/operators')
      .send({ name: 'Summit Logistics', destinationId: String(bhutan.id) });

    expect(response.status).toBe(201);
  });

  it('filters by destination, type and vetting', async () => {
    const nepal = await createDestination({ code: 'NP', name: 'Nepal' });
    const bhutan = await createDestination({ code: 'BT', name: 'Bhutan' });
    await createOperator(nepal.id, { name: 'Nepal Guides', type: 'guide' });
    await createOperator(nepal.id, { name: 'Nepal Lodges', type: 'accommodation', vettedAt: null });
    await createOperator(bhutan.id, { name: 'Bhutan Tours' });
    const actor = await signIn({ role: 'consultant' });

    expect((await actor.as('get', `/operators?destinationId=${nepal.id}`)).body.data).toHaveLength(2);
    expect((await actor.as('get', '/operators?type=guide')).body.data).toHaveLength(1);
    expect((await actor.as('get', '/operators?vetted=false')).body.data).toHaveLength(1);
  });

  it('records who vetted an operator and when', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id, { vettedAt: null });
    const actor = await signIn({ role: 'coordinator' });

    const response = await actor
      .as('post', `/operators/${operator.id}/vetting`)
      .send({ vetted: true, notes: 'Insurance and licences sighted.' });

    expect(response.status).toBe(200);
    expect(response.body.data.operator.isVetted).toBe(true);
    expect(response.body.data.operator.vettedBy.id).toBe(String(actor.user.id));
  });

  it('can withdraw vetting without deleting the operator', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'coordinator' });

    const response = await actor
      .as('post', `/operators/${operator.id}/vetting`)
      .send({ vetted: false, notes: 'Licence lapsed.' });

    expect(response.body.data.operator.isVetted).toBe(false);
    expect(await db.Operator.count({ where: { id: operator.id } })).toBe(1);
  });

  it('refuses to retire an operator with work outstanding', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const consultant = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: consultant.user.id });
    await consultant.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides',
    });

    const coordinator = await signIn({ role: 'coordinator' });
    const response = await coordinator.as('delete', `/operators/${operator.id}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OPERATOR_HAS_OPEN_WORK');
  });
});

describe('raising a confirmation', () => {
  it('refuses an operator that has not been vetted', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id, { vettedAt: null });
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const response = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides for the trek',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OPERATOR_NOT_VETTED');
  });

  it('refuses a retired operator', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id, { isActive: false });
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const response = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides',
    });

    expect(response.body.error.code).toBe('OPERATOR_INACTIVE');
  });

  it('defaults the deadline ahead of departure from the operator’s turnaround', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id, { typicalResponseDays: 10 });
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({
      consultantId: actor.user.id,
      departureDate: daysFromNow(60),
      returnDate: daysFromNow(80),
    });

    const response = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides for the trek',
    });

    expect(response.status).toBe(201);
    // 10-day turnaround doubled = 20 days before a departure 60 days out.
    expect(response.body.data.confirmation.dueBy).toBe(daysFromNow(40));
  });

  it('refuses a segment belonging to another booking', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    const otherBooking = await createBooking({ consultantId: actor.user.id,  reference: 'TA-2026-9999' });
    const segment = await db.ItinerarySegment.create({
      bookingId: otherBooking.id,
      destinationId: destination.id,
      sequence: 1,
      title: 'Somewhere else',
    });

    const response = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      itinerarySegmentId: String(segment.id),
      summary: 'Guides',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SEGMENT');
  });

  it('keeps the amount as a fixed two-place string', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const response = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides',
      currencyCode: 'npr',
      amount: '145000.5',
    });

    expect(response.body.data.confirmation.amount).toBe('145000.50');
    expect(response.body.data.confirmation.currencyCode).toBe('NPR');
  });
});

describe('the confirmation workflow', () => {
  async function setup() {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id,  departureDate: daysFromNow(40) });
    const created = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides and porters, Lukla to base camp',
    });
    return { actor, booking, operator, confirmation: created.body.data.confirmation };
  }

  it('moves pending → requested → confirmed', async () => {
    const { actor, confirmation } = await setup();
    expect(confirmation.status).toBe('pending');

    const requested = await actor.as('post', `/operators/confirmations/${confirmation.id}/request`);
    expect(requested.body.data.confirmation.status).toBe('requested');
    expect(requested.body.data.confirmation.requestedAt).toBeTruthy();

    const answered = await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: true, operatorReference: 'HA-8891' });

    expect(answered.body.data.confirmation.status).toBe('confirmed');
    expect(answered.body.data.confirmation.operatorReference).toBe('HA-8891');
    expect(answered.body.data.confirmation.responseDays).toBe(0);
  });

  it('refuses to answer a request that was never sent', async () => {
    const { actor, confirmation } = await setup();

    const response = await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(response.body.error.details.allowed).toEqual(['requested', 'cancelled']);
  });

  it('requires a reason when declining', async () => {
    const { actor, confirmation } = await setup();
    await actor.as('post', `/operators/confirmations/${confirmation.id}/request`);

    const response = await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: false });

    expect(response.status).toBe(400);
    expect(response.body.error.details.reason).toBeTruthy();
  });

  it('lets a confirmed arrangement be declined later, but not the reverse', async () => {
    const { actor, confirmation } = await setup();
    await actor.as('post', `/operators/confirmations/${confirmation.id}/request`);
    await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: true });

    const withdrawn = await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: false, reason: 'Lead guide injured; cannot staff the departure.' });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data.confirmation.status).toBe('declined');

    const reversed = await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: true });
    expect(reversed.status).toBe(400);
    expect(reversed.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('notifies trip editors when an operator declines', async () => {
    const { actor, confirmation } = await setup();
    const coordinator = await signIn({ role: 'coordinator' });
    await actor.as('post', `/operators/confirmations/${confirmation.id}/request`);

    await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: false, reason: 'Fully booked that week.' });

    const notification = await db.Notification.findOne({
      where: { userId: coordinator.user.id, type: 'operator_declined' },
    });
    expect(notification).toBeTruthy();
    expect(notification.severity).toBe('warning');
  });

  it('restricts edits once the record is closed', async () => {
    const { actor, confirmation } = await setup();
    await actor.as('post', `/operators/confirmations/${confirmation.id}/request`);
    await actor
      .as('post', `/operators/confirmations/${confirmation.id}/respond`)
      .send({ confirmed: true });

    const summaryEdit = await actor
      .as('patch', `/operators/confirmations/${confirmation.id}`)
      .send({ summary: 'Something else entirely' });
    expect(summaryEdit.status).toBe(400);
    expect(summaryEdit.body.error.code).toBe('CONFIRMATION_CLOSED');

    // The figures finance reconciles against stay correctable.
    const amountEdit = await actor
      .as('patch', `/operators/confirmations/${confirmation.id}`)
      .send({ amount: '2400.00' });
    expect(amountEdit.status).toBe(200);
    expect(amountEdit.body.data.confirmation.amount).toBe('2400.00');
  });
});

describe('chasing', () => {
  it('lists what is outstanding, soonest first, and flags overdue', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    for (const [summary, dueBy] of [
      ['Late one', daysFromNow(-3)],
      ['Soon', daysFromNow(2)],
      ['Later', daysFromNow(20)],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await actor.as('post', '/operators/confirmations').send({
        bookingId: String(booking.id),
        operatorId: String(operator.id),
        summary,
        dueBy,
      });
    }

    const response = await actor.as('get', '/operators/outstanding');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row) => row.summary)).toEqual(['Late one', 'Soon', 'Later']);
    expect(response.body.data[0].overdue).toBe(true);
    expect(response.body.data[1].overdue).toBe(false);

    const overdueOnly = await actor.as('get', '/operators/outstanding?overdueOnly=true');
    expect(overdueOnly.body.data).toHaveLength(1);
  });

  it('leaves cancelled bookings out of the chase list', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides',
      dueBy: daysFromNow(5),
    });

    expect((await actor.as('get', '/operators/outstanding')).body.data).toHaveLength(1);

    await booking.update({ status: 'cancelled' });
    expect((await actor.as('get', '/operators/outstanding')).body.data).toHaveLength(0);
  });

  it('summarises for the dashboard', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    await createOperator(destination.id, { name: 'Unvetted Partner', vettedAt: null });
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });
    await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Guides',
      dueBy: daysFromNow(-1),
    });

    const response = await actor.as('get', '/operators/summary');

    expect(response.body.data.outstanding).toBe(1);
    expect(response.body.data.overdue).toBe(1);
    expect(response.body.data.notYetRequested).toBe(1);
    expect(response.body.data.activeOperators).toBe(2);
    expect(response.body.data.unvettedOperators).toBe(1);
  });
});

describe('booking readiness', () => {
  it('names segments with no operator arranged at all', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const covered = await db.ItinerarySegment.create({
      bookingId: booking.id,
      destinationId: destination.id,
      sequence: 1,
      title: 'Kathmandu briefing',
    });
    await db.ItinerarySegment.create({
      bookingId: booking.id,
      destinationId: destination.id,
      sequence: 2,
      title: 'Lukla to base camp',
    });

    await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      itinerarySegmentId: String(covered.id),
      summary: 'Briefing and transfers',
    });

    const response = await actor.as('get', `/operators/bookings/${booking.id}/readiness`);

    expect(response.status).toBe(200);
    expect(response.body.data.summary.uncoveredSegments).toBe(1);
    expect(response.body.data.uncoveredSegments[0].title).toBe('Lukla to base camp');
    expect(response.body.data.summary.ready).toBe(false);
  });

  it('is ready only when nothing is outstanding or declined', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const created = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Everything',
    });
    const id = created.body.data.confirmation.id;

    expect(
      (await actor.as('get', `/operators/bookings/${booking.id}/readiness`)).body.data.summary.ready
    ).toBe(false);

    await actor.as('post', `/operators/confirmations/${id}/request`);
    await actor.as('post', `/operators/confirmations/${id}/respond`).send({ confirmed: true });

    const ready = await actor.as('get', `/operators/bookings/${booking.id}/readiness`);
    expect(ready.body.data.summary.ready).toBe(true);
    expect(ready.body.data.summary.confirmed).toBe(1);
  });

  it('leaves cancelled confirmations out of the counts', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    const created = await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Raised by mistake',
    });
    await actor.as('delete', `/operators/confirmations/${created.body.data.confirmation.id}`);

    const response = await actor.as('get', `/operators/bookings/${booking.id}/readiness`);
    expect(response.body.data.summary.total).toBe(0);
  });
});

describe('operator performance', () => {
  it('reports confirmation rate and average response time', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });
    const booking = await createBooking({ consultantId: actor.user.id });

    // Two answered — one yes, one no — and one still open.
    for (const [summary, confirmed] of [['A', true], ['B', false]]) {
      // eslint-disable-next-line no-await-in-loop
      const created = await actor.as('post', '/operators/confirmations').send({
        bookingId: String(booking.id),
        operatorId: String(operator.id),
        summary,
      });
      const id = created.body.data.confirmation.id;
      // eslint-disable-next-line no-await-in-loop
      await actor.as('post', `/operators/confirmations/${id}/request`);
      // eslint-disable-next-line no-await-in-loop
      await actor
        .as('post', `/operators/confirmations/${id}/respond`)
        .send(confirmed ? { confirmed: true } : { confirmed: false, reason: 'No capacity.' });
    }
    await actor.as('post', '/operators/confirmations').send({
      bookingId: String(booking.id),
      operatorId: String(operator.id),
      summary: 'Still waiting',
    });

    const response = await actor.as('get', `/operators/${operator.id}`);
    const { stats } = response.body.data.operator;

    expect(stats.total).toBe(3);
    expect(stats.confirmed).toBe(1);
    expect(stats.declined).toBe(1);
    expect(stats.outstanding).toBe(1);
    // Of the two answered, one was yes — the open request must not drag it down.
    expect(stats.confirmationRate).toBe(50);
    expect(stats.averageResponseDays).toBe(0);
  });

  it('reports null rather than zero when nothing has been answered', async () => {
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const actor = await signIn({ role: 'consultant' });

    const response = await actor.as('get', `/operators/${operator.id}`);
    expect(response.body.data.operator.stats.confirmationRate).toBeNull();
    expect(response.body.data.operator.stats.averageResponseDays).toBeNull();
  });
});
