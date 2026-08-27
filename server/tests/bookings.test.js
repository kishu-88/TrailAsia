'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createDestination,
  createRequirement,
  createTraveller,
  daysFromNow,
} = require('./helpers');

beforeEach(resetDatabase);

async function makeBooking(actor, overrides = {}) {
  const response = await actor.as('post', '/bookings').send({
    title: 'Everest Base Camp trek',
    departureDate: daysFromNow(90),
    returnDate: daysFromNow(111),
    partySize: 2,
    totalAmount: '8450.00',
    ...overrides,
  });
  if (response.status !== 201) {
    throw new Error(`Booking creation failed (${response.status}): ${response.text}`);
  }
  return response.body.data.booking;
}

describe('creation', () => {
  it('allocates a sequential reference and defaults the consultant to the creator', async () => {
    const actor = await signIn({ role: 'consultant' });

    const first = await makeBooking(actor);
    const second = await makeBooking(actor, { title: 'Annapurna circuit' });

    const year = new Date().getFullYear();
    expect(first.reference).toBe(`TA-${year}-0001`);
    expect(second.reference).toBe(`TA-${year}-0002`);
    expect(first.consultantId).toBe(String(actor.user.id));
    expect(first.status).toBe('enquiry');
  });

  it('keeps money as a string with two decimal places', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor, { totalAmount: '8450.5' });
    expect(booking.totalAmount).toBe('8450.50');
    expect(typeof booking.totalAmount).toBe('string');
  });

  it('rejects a return date before departure', async () => {
    const actor = await signIn({ role: 'consultant' });
    const response = await actor.as('post', '/bookings').send({
      title: 'Backwards trip',
      departureDate: daysFromNow(30),
      returnDate: daysFromNow(10),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.details.returnDate).toBeTruthy();
  });

  it('rejects a malformed amount', async () => {
    const actor = await signIn({ role: 'consultant' });
    const response = await actor
      .as('post', '/bookings')
      .send({ title: 'Trip', totalAmount: 'about eight thousand' });
    expect(response.body.error.details.totalAmount).toBeTruthy();
  });

  it('attaches travellers named at creation', async () => {
    const actor = await signIn({ role: 'consultant' });
    const one = await createTraveller();
    const two = await createTraveller();

    const booking = await makeBooking(actor, {
      travellerIds: [String(one.id), String(two.id)],
      leadTravellerId: String(one.id),
    });

    expect(booking.travellers).toHaveLength(2);
    expect(booking.travellers.find((t) => t.id === String(one.id)).isLead).toBe(true);
  });

  it('refuses an unknown traveller', async () => {
    const actor = await signIn({ role: 'consultant' });
    const response = await actor
      .as('post', '/bookings')
      .send({ title: 'Trip', travellerIds: ['999999'] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_TRAVELLER');
  });

  it('refuses an inactive consultant', async () => {
    const actor = await signIn({ role: 'admin' });
    const inactive = await db.User.create({
      firstName: 'Gone',
      lastName: 'Away',
      email: 'gone@trailasia.test',
      role: 'consultant',
      isActive: false,
      passwordHash: await db.User.hashPassword('irrelevant-1234'),
    });

    const response = await actor
      .as('post', '/bookings')
      .send({ title: 'Trip', consultantId: String(inactive.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_STAFF_REFERENCE');
  });

  it('refuses creation by finance but allows reading', async () => {
    const consultant = await signIn({ role: 'consultant' });
    await makeBooking(consultant);
    const finance = await signIn({ role: 'finance' });

    expect((await finance.as('post', '/bookings').send({ title: 'Nope' })).status).toBe(403);
    expect((await finance.as('get', '/bookings')).status).toBe(200);
  });
});

describe('status transitions', () => {
  it('follows the allowed path', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const quoted = await actor.as('patch', `/bookings/${booking.id}`).send({ status: 'quoted' });
    expect(quoted.body.data.booking.status).toBe('quoted');

    const confirmed = await actor
      .as('patch', `/bookings/${booking.id}`)
      .send({ status: 'confirmed' });
    expect(confirmed.body.data.booking.status).toBe('confirmed');
    expect(confirmed.body.data.booking.allowedNextStatuses).toEqual(['in_progress', 'cancelled']);
  });

  it('refuses a transition that skips or reverses the workflow', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor
      .as('patch', `/bookings/${booking.id}`)
      .send({ status: 'completed' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(response.body.error.details.allowed).toEqual(['quoted', 'cancelled']);
  });

  it('will not cancel through the update endpoint', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor
      .as('patch', `/bookings/${booking.id}`)
      .send({ status: 'cancelled' });

    // Rejected by the schema before it ever reaches the service.
    expect(response.status).toBe(400);
  });
});

describe('cancellation', () => {
  it('records a reason and timestamp', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor
      .as('post', `/bookings/${booking.id}/cancel`)
      .send({ reason: 'Traveller withdrew after a family emergency.' });

    expect(response.status).toBe(200);
    expect(response.body.data.booking.status).toBe('cancelled');
    expect(response.body.data.booking.cancelledAt).toBeTruthy();
  });

  it('requires a reason', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor.as('post', `/bookings/${booking.id}/cancel`).send({});
    expect(response.status).toBe(400);
    expect(response.body.error.details.reason).toBeTruthy();
  });

  it('locks the booking against further edits', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    await actor.as('post', `/bookings/${booking.id}/cancel`).send({ reason: 'Withdrawn.' });

    const response = await actor.as('patch', `/bookings/${booking.id}`).send({ title: 'New name' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BOOKING_CANCELLED');
  });
});

describe('party management', () => {
  it('adds and removes travellers, keeping the lead in step', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const traveller = await createTraveller();

    const added = await actor
      .as('post', `/bookings/${booking.id}/travellers`)
      .send({ travellerId: String(traveller.id), isLead: true });

    expect(added.status).toBe(201);
    expect(added.body.data.booking.leadTravellerId).toBe(String(traveller.id));

    const removed = await actor.as(
      'delete',
      `/bookings/${booking.id}/travellers/${traveller.id}`
    );
    expect(removed.body.data.booking.leadTravellerId).toBeNull();
    expect(removed.body.data.booking.travellers).toHaveLength(0);
  });

  it('refuses the same traveller twice', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const booking = await makeBooking(actor, { travellerIds: [String(traveller.id)] });

    const response = await actor
      .as('post', `/bookings/${booking.id}/travellers`)
      .send({ travellerId: String(traveller.id) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TRAVELLER_ALREADY_ON_BOOKING');
  });
});

describe('itinerary', () => {
  it('appends segments in order', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const nepal = await createDestination({ code: 'NP', name: 'Nepal' });
    const bhutan = await createDestination({ code: 'BT', name: 'Bhutan' });

    await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(nepal.id), title: 'Everest Base Camp' });
    await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(bhutan.id), title: 'Paro extension' });

    const response = await actor.as('get', `/bookings/${booking.id}/itinerary`);
    expect(response.body.data.map((s) => s.sequence)).toEqual([1, 2]);
    expect(response.body.data[1].destination.name).toBe('Bhutan');
  });

  it('refuses a duplicate position', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const nepal = await createDestination();

    await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(nepal.id), title: 'One', sequence: 1 });

    const response = await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(nepal.id), title: 'Two', sequence: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SEQUENCE_IN_USE');
  });

  it('refuses an unknown destination', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: '999999', title: 'Nowhere' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DESTINATION');
  });

  it('reorders without tripping the unique index', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const destination = await createDestination();

    const ids = [];
    for (const title of ['A', 'B', 'C']) {
      // eslint-disable-next-line no-await-in-loop
      const created = await actor
        .as('post', `/bookings/${booking.id}/itinerary`)
        .send({ destinationId: String(destination.id), title });
      ids.push(created.body.data.segment.id);
    }

    const response = await actor
      .as('post', `/bookings/${booking.id}/itinerary/reorder`)
      .send({ segmentIds: [ids[2], ids[0], ids[1]] });

    expect(response.status).toBe(200);
    expect(response.body.data.map((s) => s.title)).toEqual(['C', 'A', 'B']);
    expect(response.body.data.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  it('refuses a partial reorder list', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const destination = await createDestination();
    const created = await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(destination.id), title: 'A' });
    await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(destination.id), title: 'B' });

    const response = await actor
      .as('post', `/bookings/${booking.id}/itinerary/reorder`)
      .send({ segmentIds: [created.body.data.segment.id] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INCOMPLETE_REORDER');
  });

  it('deletes a segment', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);
    const destination = await createDestination();
    const created = await actor
      .as('post', `/bookings/${booking.id}/itinerary`)
      .send({ destinationId: String(destination.id), title: 'A' });

    const response = await actor.as(
      'delete',
      `/bookings/${booking.id}/itinerary/${created.body.data.segment.id}`
    );
    expect(response.status).toBe(204);
  });
});

describe('filtering', () => {
  it('filters by status and by destination', async () => {
    const actor = await signIn({ role: 'consultant' });
    const nepal = await createDestination({ code: 'NP' });
    const bhutan = await createDestination({ code: 'BT', name: 'Bhutan' });

    const withNepal = await makeBooking(actor, { title: 'Nepal trip' });
    const withBhutan = await makeBooking(actor, { title: 'Bhutan trip' });

    await actor
      .as('post', `/bookings/${withNepal.id}/itinerary`)
      .send({ destinationId: String(nepal.id), title: 'Kathmandu' });
    await actor
      .as('post', `/bookings/${withBhutan.id}/itinerary`)
      .send({ destinationId: String(bhutan.id), title: 'Paro' });
    await actor.as('patch', `/bookings/${withNepal.id}`).send({ status: 'quoted' });

    const byStatus = await actor.as('get', '/bookings?status=quoted');
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].title).toBe('Nepal trip');

    const byDestination = await actor.as('get', `/bookings?destinationId=${bhutan.id}`);
    expect(byDestination.body.data).toHaveLength(1);
    expect(byDestination.body.data[0].title).toBe('Bhutan trip');
  });

  it('searches by reference', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor.as('get', `/bookings?q=${booking.reference}`);
    expect(response.body.data).toHaveLength(1);
  });
});

describe('GET /bookings/:id/readiness', () => {
  it('reports outstanding documents across the whole party', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await createDestination({ code: 'NP', maxAltitudeMetres: 5644 });
    await createRequirement(destination.id, {
      type: 'insurance',
      name: 'High-altitude trekking cover',
      requiresAltitudeCover: true,
      leadTimeDays: 21,
    });

    const ready = await createTraveller();
    const notReady = await createTraveller();
    await db.TravellerDocument.create({
      travellerId: ready.id,
      destinationId: destination.id,
      type: 'insurance',
      status: 'verified',
      expiresOn: daysFromNow(300),
      altitudeCoverMetres: 6000,
      insurerContactPhone: '+61 2 5550 1234',
    });

    const booking = await makeBooking(actor, {
      travellerIds: [String(ready.id), String(notReady.id)],
    });
    await actor.as('post', `/bookings/${booking.id}/itinerary`).send({
      destinationId: String(destination.id),
      title: 'Everest Base Camp',
      maxAltitudeMetres: 5364,
    });

    const response = await actor.as('get', `/bookings/${booking.id}/readiness`);

    expect(response.status).toBe(200);
    expect(response.body.data.summary.partySize).toBe(2);
    expect(response.body.data.summary.travellersReady).toBe(1);
    expect(response.body.data.summary.outstanding).toBe(1);
    expect(response.body.data.summary.ready).toBe(false);
    expect(response.body.data.summary.maxAltitudeMetres).toBe(5364);
  });

  it('refuses when there is no itinerary to check against', async () => {
    const actor = await signIn({ role: 'consultant' });
    const booking = await makeBooking(actor);

    const response = await actor.as('get', `/bookings/${booking.id}/readiness`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_ITINERARY');
  });
});
