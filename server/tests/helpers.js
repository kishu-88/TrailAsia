'use strict';

const request = require('supertest');

const app = require('../src/app');
const db = require('../src/models');

const API = process.env.API_PREFIX || '/api/v1';

let userCounter = 0;

/** Empty every table between tests so cases cannot leak into each other. */
async function resetDatabase() {
  const models = [
    'ContactMessage',
    'EmailLog',
    'Notification',
    'TaskEvent',
    'Task',
    'LocationPing',
    'LocationConsent',
    'SosAlertEvent',
    'SosAlert',
    // Payments reference schedules and operator confirmations, so they go
    // first; schedules reference bookings, so they go before those.
    'Payment',
    'PaymentSchedule',
    // Before ItinerarySegment and Booking, which they reference, and before
    // Operator, which they restrict the deletion of.
    'OperatorConfirmation',
    'Operator',
    'ItinerarySegment',
    'BookingTraveller',
    'Booking',
    'TravellerDocument',
    'Traveller',
    'DocumentRequirement',
    'Destination',
    'RefreshToken',
    'User',
  ];
  for (const name of models) {
    // eslint-disable-next-line no-await-in-loop
    await db[name].destroy({ where: {}, force: true });
  }
}

/** Create a staff account. Returns the model instance plus its plaintext password. */
async function createUser({ role = 'consultant', password = 'test-password-1234', ...rest } = {}) {
  userCounter += 1;
  const user = await db.User.create({
    firstName: rest.firstName || 'Test',
    lastName: rest.lastName || `User${userCounter}`,
    email: rest.email || `user${userCounter}@trailasia.test`,
    role,
    isActive: rest.isActive !== undefined ? rest.isActive : true,
    passwordHash: await db.User.hashPassword(password),
  });
  return { user, password };
}

/**
 * Create a user and sign them in.
 *
 * Returns an `as` helper that attaches the bearer token, so tests read as
 * `await actor.as('post', '/bookings').send({...})`.
 */
async function signIn(options = {}) {
  const { user, password } = await createUser(options);
  const response = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: user.email, password });

  if (response.status !== 200) {
    throw new Error(`Test sign-in failed (${response.status}): ${response.text}`);
  }

  const { accessToken } = response.body.data;
  const cookie = response.headers['set-cookie'];

  return {
    user,
    password,
    accessToken,
    cookie,
    as(method, path) {
      return request(app)[method](`${API}${path}`).set('Authorization', `Bearer ${accessToken}`);
    },
  };
}

/** An unauthenticated request. */
function anon(method, path) {
  return request(app)[method](`${API}${path}`);
}

async function createDestination(overrides = {}) {
  return db.Destination.create({
    code: overrides.code || 'NP',
    name: overrides.name || 'Nepal',
    countryCode: overrides.countryCode || 'NP',
    region: overrides.region || 'Himalaya',
    currencyCode: overrides.currencyCode || 'NPR',
    maxAltitudeMetres: overrides.maxAltitudeMetres ?? 5644,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  });
}

async function createRequirement(destinationId, overrides = {}) {
  return db.DocumentRequirement.create({
    destinationId,
    type: overrides.type || 'insurance',
    name: overrides.name || 'Travel insurance',
    isMandatory: overrides.isMandatory !== undefined ? overrides.isMandatory : true,
    leadTimeDays: overrides.leadTimeDays ?? 21,
    minValidityMonths: overrides.minValidityMonths ?? null,
    requiresAltitudeCover: overrides.requiresAltitudeCover || false,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
  });
}

let travellerCounter = 0;
async function createTraveller(overrides = {}) {
  travellerCounter += 1;
  return db.Traveller.create({
    firstName: overrides.firstName || 'Ang',
    lastName: overrides.lastName || `Traveller${travellerCounter}`,
    email: overrides.email || `traveller${travellerCounter}@example.com`,
    passportNumber: overrides.passportNumber ?? 'PA1234567',
    passportExpiry: overrides.passportExpiry ?? '2032-01-01',
    ...overrides,
  });
}

/** A date `days` from today as YYYY-MM-DD — handy for lead-time assertions. */
function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

let bookingCounter = 0;

/**
 * A booking with a party, built straight through the models.
 *
 * The safety tests are about consent, scope and alert handling, and driving
 * eight booking endpoints to reach the point where a traveller is on a trip
 * would bury that behind setup the booking suite already covers.
 */
async function createBooking({ consultantId, travellers = [], ...overrides } = {}) {
  bookingCounter += 1;
  let ownerId = consultantId;
  if (!ownerId) {
    const { user } = await createUser({ role: 'consultant' });
    ownerId = user.id;
  }

  const booking = await db.Booking.create({
    reference: overrides.reference || `TA-TEST-${String(bookingCounter).padStart(4, '0')}`,
    title: overrides.title || 'Everest Base Camp trek',
    status: overrides.status || 'confirmed',
    consultantId: ownerId,
    coordinatorId: overrides.coordinatorId ?? null,
    departureDate: overrides.departureDate ?? daysFromNow(30),
    returnDate: overrides.returnDate ?? daysFromNow(51),
    partySize: overrides.partySize ?? Math.max(travellers.length, 1),
  });

  for (const [index, traveller] of travellers.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await db.BookingTraveller.create({
      bookingId: booking.id,
      travellerId: traveller.id,
      isLead: index === 0,
    });
  }

  return booking;
}

const TRAVELLER_PASSWORD = 'traveller-password-1234';

/**
 * A traveller with portal access, signed in.
 *
 * Mirrors `signIn` for staff, including the `as` helper, so a test that checks
 * both audiences against one route reads the same way for each.
 */
async function signInTraveller(overrides = {}) {
  const password = overrides.password || TRAVELLER_PASSWORD;
  const traveller = await createTraveller({
    ...overrides,
    password: undefined,
    passwordHash: await db.Traveller.hashPassword(password),
    portalEnabled: true,
    portalActivatedAt: new Date(),
  });

  const response = await request(app)
    .post(`${API}/auth/traveller/login`)
    .send({ email: traveller.email, password });

  if (response.status !== 200) {
    throw new Error(`Traveller sign-in failed (${response.status}): ${response.text}`);
  }

  const { accessToken } = response.body.data;

  return {
    traveller,
    password,
    accessToken,
    cookie: response.headers['set-cookie'],
    as(method, path) {
      return request(app)[method](`${API}${path}`).set('Authorization', `Bearer ${accessToken}`);
    },
  };
}

const OPERATOR_PASSWORD = 'operator-password-1234';

let operatorCounter = 0;

/** A vetted, active operator, optionally with portal access. */
async function createOperator(destinationId, overrides = {}) {
  operatorCounter += 1;
  return db.Operator.create({
    name: overrides.name || `Test Operator ${operatorCounter}`,
    destinationId,
    type: overrides.type || 'full_service',
    contactEmail: overrides.contactEmail || `operator${operatorCounter}@example.com`,
    typicalResponseDays: overrides.typicalResponseDays ?? 3,
    vettedAt: overrides.vettedAt === undefined ? new Date() : overrides.vettedAt,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  });
}

/**
 * An operator with portal access, signed in. Mirrors `signInTraveller` —
 * see that one for why the shape matches `signIn` for staff.
 */
async function signInOperator(destinationId, overrides = {}) {
  const password = overrides.password || OPERATOR_PASSWORD;
  const operator = await createOperator(destinationId, {
    ...overrides,
    password: undefined,
    passwordHash: await db.Operator.hashPassword(password),
    portalEnabled: true,
    portalActivatedAt: new Date(),
  });

  const response = await request(app)
    .post(`${API}/auth/operator/login`)
    .send({ email: operator.contactEmail, password });

  if (response.status !== 200) {
    throw new Error(`Operator sign-in failed (${response.status}): ${response.text}`);
  }

  const { accessToken } = response.body.data;

  return {
    operator,
    password,
    accessToken,
    cookie: response.headers['set-cookie'],
    as(method, path) {
      return request(app)[method](`${API}${path}`).set('Authorization', `Bearer ${accessToken}`);
    },
  };
}

module.exports = {
  API,
  app,
  db,
  request,
  resetDatabase,
  createUser,
  signIn,
  anon,
  createDestination,
  createRequirement,
  createTraveller,
  createBooking,
  signInTraveller,
  TRAVELLER_PASSWORD,
  createOperator,
  signInOperator,
  OPERATOR_PASSWORD,
  daysFromNow,
};
