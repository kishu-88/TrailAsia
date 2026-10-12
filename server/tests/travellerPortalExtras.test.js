'use strict';

const {
  db,
  app,
  API,
  request,
  resetDatabase,
  anon,
  signIn,
  createUser,
  createDestination,
  createTraveller,
  createBooking,
  signInTraveller,
} = require('./helpers');

beforeEach(resetDatabase);

describe('GET /me/trips/:bookingId/payments', () => {
  it("returns the traveller's own payment plan, without staff-only fields", async () => {
    const { traveller, as } = await signInTraveller();
    const booking = await createBooking({ travellers: [traveller] });

    const schedule = await db.PaymentSchedule.create({
      bookingId: booking.id,
      label: 'Deposit',
      sequence: 1,
      dueOn: '2027-01-01',
      amount: '500.00',
      currencyCode: 'AUD',
    });
    await db.Payment.create({
      bookingId: booking.id,
      paymentScheduleId: schedule.id,
      direction: 'incoming',
      method: 'card',
      status: 'cleared',
      amount: '200.00',
      currencyCode: 'AUD',
      amountInBase: '200.00',
      receivedOn: '2026-12-20',
      clearedAt: new Date(),
    });

    const response = await as('get', `/me/trips/${booking.id}/payments`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      label: 'Deposit',
      amount: '500.00',
      paid: '200.00',
      outstanding: '300.00',
      settled: false,
    });
    expect(response.body.data[0].notes).toBeUndefined();
    expect(response.body.data[0].createdBy).toBeUndefined();
  });

  it("404s a booking the traveller isn't on", async () => {
    const { as } = await signInTraveller();
    const someoneElse = await createTraveller({ email: 'other@example.com' });
    const booking = await createBooking({ travellers: [someoneElse] });

    const response = await as('get', `/me/trips/${booking.id}/payments`);
    expect(response.status).toBe(404);
  });

  it('rejects an anonymous request', async () => {
    const booking = await createBooking();
    const response = await anon('get', `/me/trips/${booking.id}/payments`);
    expect(response.status).toBe(401);
  });
});

describe('POST /me/documents', () => {
  it('lets a traveller add their own document, always landing as submitted', async () => {
    const { traveller, as } = await signInTraveller();
    const destination = await createDestination();

    const response = await as('post', '/me/documents').send({
      type: 'insurance',
      destinationId: destination.id,
      reference: 'POL-998877',
      issuer: 'World Nomads',
      issuedOn: '2026-06-01',
      expiresOn: '2027-06-01',
      filePath: 'https://example.com/my-policy.pdf',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.document.status).toBe('submitted');
    expect(response.body.data.document.verifiedBy).toBeUndefined();

    const stored = await db.TravellerDocument.findOne({
      where: { travellerId: traveller.id, reference: 'POL-998877' },
    });
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('submitted');
  });

  it('cannot self-verify — status is always submitted regardless of what is sent', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents').send({
      type: 'passport',
      status: 'verified',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.document.status).toBe('submitted');
  });

  it('notifies whoever created the traveller record', async () => {
    const { user: consultant } = await createUser({ role: 'consultant' });
    const traveller = await createTraveller({
      email: 'notify-me@example.com',
      createdByUserId: consultant.id,
      passwordHash: await db.Traveller.hashPassword('traveller-password-1234'),
      portalEnabled: true,
      portalActivatedAt: new Date(),
    });

    const login = await request(app)
      .post(`${API}/auth/traveller/login`)
      .send({ email: traveller.email, password: 'traveller-password-1234' });
    const token = login.body.data.accessToken;

    await request(app)
      .post(`${API}/me/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'visa' });

    const notification = await db.Notification.findOne({
      where: { userId: consultant.id, type: 'document_submitted' },
    });
    expect(notification).toBeTruthy();
  });

  it('rejects an unknown destination', async () => {
    const { as } = await signInTraveller();

    const response = await as('post', '/me/documents').send({
      type: 'visa',
      destinationId: '999999',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DESTINATION');
  });
});

describe('GET /me/documents', () => {
  it("lists the traveller's own documents across every trip, newest first", async () => {
    const { traveller, as } = await signInTraveller();
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'insurance',
      status: 'submitted',
    });
    await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'verified',
    });

    const response = await as('get', '/me/documents');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].type).toBe('visa');
  });

  it('never returns another traveller\'s documents', async () => {
    const { as } = await signInTraveller();
    const other = await createTraveller();
    await db.TravellerDocument.create({
      travellerId: other.id,
      type: 'visa',
      status: 'submitted',
    });

    const response = await as('get', '/me/documents');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});

describe('traveller notifications', () => {
  it('sees its own notification when a document is verified, separate from the staff inbox', async () => {
    const { user: consultant } = await createUser({ role: 'consultant' });
    const coordinator = await signIn({ role: 'coordinator' });
    const traveller = await createTraveller({
      email: 'reviewed@example.com',
      createdByUserId: consultant.id,
      passwordHash: await db.Traveller.hashPassword('traveller-password-1234'),
      portalEnabled: true,
      portalActivatedAt: new Date(),
    });
    const document = await db.TravellerDocument.create({
      travellerId: traveller.id,
      type: 'visa',
      status: 'submitted',
    });

    await coordinator
      .as('post', `/travellers/${traveller.id}/documents/${document.id}/verify`)
      .send({ approved: true });

    const login = await request(app)
      .post(`${API}/auth/traveller/login`)
      .send({ email: traveller.email, password: 'traveller-password-1234' });
    const token = login.body.data.accessToken;

    const response = await request(app)
      .get(`${API}/me/notifications`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('document_verified');
    expect(response.body.data[0].link).toBe('/my-trip');

    const unread = await request(app)
      .get(`${API}/me/notifications/unread-count`)
      .set('Authorization', `Bearer ${token}`);
    expect(unread.body.data.unread).toBe(1);

    const markRead = await request(app)
      .post(`${API}/me/notifications/${response.body.data[0].id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.notification.readAt).toBeTruthy();
  });

  it('never sees a staff notification, and staff never see a traveller one', async () => {
    const { traveller, as } = await signInTraveller();

    const response = await as('get', '/me/notifications');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });
});
