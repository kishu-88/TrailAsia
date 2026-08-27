'use strict';

const request = require('supertest');

const app = require('../src/app');
const db = require('../src/models');

const API = process.env.API_PREFIX || '/api/v1';

let userCounter = 0;

/** Empty every table between tests so cases cannot leak into each other. */
async function resetDatabase() {
  const models = [
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
  daysFromNow,
};
