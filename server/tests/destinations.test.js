'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createDestination,
  createRequirement,
} = require('./helpers');

beforeEach(resetDatabase);

describe('permissions', () => {
  it('lets any signed-in role read destinations', async () => {
    await createDestination();
    const finance = await signIn({ role: 'finance' });
    expect((await finance.as('get', '/destinations')).status).toBe(200);
  });

  it('refuses a consultant creating a destination', async () => {
    const actor = await signIn({ role: 'consultant' });
    const response = await actor
      .as('post', '/destinations')
      .send({ code: 'LK', name: 'Sri Lanka' });
    expect(response.status).toBe(403);
  });

  it('allows a coordinator to create one', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const response = await actor
      .as('post', '/destinations')
      .send({ code: 'lk', name: 'Sri Lanka', currencyCode: 'lkr' });

    expect(response.status).toBe(201);
    expect(response.body.data.destination.code).toBe('LK');
    expect(response.body.data.destination.currencyCode).toBe('LKR');
  });
});

describe('destination CRUD', () => {
  it('refuses a duplicate code', async () => {
    const actor = await signIn({ role: 'coordinator' });
    await createDestination({ code: 'NP' });

    const response = await actor.as('post', '/destinations').send({ code: 'NP', name: 'Nepal' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CODE_IN_USE');
  });

  it('validates the code format and altitude range', async () => {
    const actor = await signIn({ role: 'coordinator' });

    const badCode = await actor
      .as('post', '/destinations')
      .send({ code: 'has spaces', name: 'Nowhere' });
    expect(badCode.body.error.details.code).toBeTruthy();

    const badAltitude = await actor
      .as('post', '/destinations')
      .send({ code: 'XX', name: 'Nowhere', maxAltitudeMetres: 99000 });
    expect(badAltitude.body.error.details.maxAltitudeMetres).toBeTruthy();
  });

  it('returns a destination with its requirements', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await createDestination();
    await createRequirement(destination.id, { type: 'visa', name: 'Tourist visa' });

    const response = await actor.as('get', `/destinations/${destination.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.destination.documentRequirements).toHaveLength(1);
  });

  it('404s for an unknown destination', async () => {
    const actor = await signIn({ role: 'consultant' });
    const response = await actor.as('get', '/destinations/999999');
    expect(response.status).toBe(404);
  });

  it('deactivates rather than deleting', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();

    const response = await actor.as('delete', `/destinations/${destination.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.destination.isActive).toBe(false);
    expect(await db.Destination.count({ where: { id: destination.id } })).toBe(1);
  });

  it('filters by active state', async () => {
    const actor = await signIn({ role: 'consultant' });
    await createDestination({ code: 'NP', name: 'Nepal' });
    await createDestination({ code: 'BT', name: 'Bhutan', isActive: false });

    const active = await actor.as('get', '/destinations?isActive=true');
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0].code).toBe('NP');
  });
});

describe('hard delete', () => {
  it('is refused when itinerary segments reference the destination', async () => {
    const admin = await signIn({ role: 'admin' });
    const destination = await createDestination();
    const booking = await db.Booking.create({
      reference: 'TA-2026-0001',
      title: 'Test',
      consultantId: admin.user.id,
    });
    await db.ItinerarySegment.create({
      bookingId: booking.id,
      destinationId: destination.id,
      sequence: 1,
      title: 'Kathmandu',
    });

    const response = await admin.as('delete', `/destinations/${destination.id}/permanent`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DESTINATION_IN_USE');
  });

  it('succeeds when nothing references it', async () => {
    const admin = await signIn({ role: 'admin' });
    const destination = await createDestination();

    const response = await admin.as('delete', `/destinations/${destination.id}/permanent`);

    expect(response.status).toBe(204);
    expect(await db.Destination.count({ where: { id: destination.id } })).toBe(0);
  });

  it('is refused for a coordinator', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    expect((await actor.as('delete', `/destinations/${destination.id}/permanent`)).status).toBe(403);
  });
});

describe('document requirements', () => {
  it('adds, updates and removes a requirement', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();

    const created = await actor
      .as('post', `/destinations/${destination.id}/document-requirements`)
      .send({
        type: 'insurance',
        name: 'High-altitude trekking cover',
        requiresAltitudeCover: true,
        leadTimeDays: 21,
      });

    expect(created.status).toBe(201);
    const requirementId = created.body.data.requirement.id;

    const updated = await actor
      .as('patch', `/destinations/${destination.id}/document-requirements/${requirementId}`)
      .send({ leadTimeDays: 30 });
    expect(updated.body.data.requirement.leadTimeDays).toBe(30);

    const removed = await actor.as(
      'delete',
      `/destinations/${destination.id}/document-requirements/${requirementId}`
    );
    expect(removed.status).toBe(204);
  });

  it('refuses a duplicate requirement on the same destination', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    await createRequirement(destination.id, { type: 'visa', name: 'Tourist visa' });

    const response = await actor
      .as('post', `/destinations/${destination.id}/document-requirements`)
      .send({ type: 'visa', name: 'Tourist visa' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REQUIREMENT_EXISTS');
  });

  it('hides inactive requirements unless asked for', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await createDestination();
    await createRequirement(destination.id, { name: 'Retired rule', isActive: false });

    const listed = await actor.as('get', `/destinations/${destination.id}/document-requirements`);
    expect(listed.body.data).toHaveLength(0);

    const all = await actor.as(
      'get',
      `/destinations/${destination.id}/document-requirements?includeInactive=true`
    );
    expect(all.body.data).toHaveLength(1);
  });
});
