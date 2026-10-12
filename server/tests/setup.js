'use strict';

/**
 * Test bootstrap.
 *
 * Tests run against an in-memory SQLite database rather than MySQL, so anyone
 * can clone the repo and run `npm test` without installing or seeding a server.
 * The trade-off is real and worth stating: SQLite is not MySQL. It ignores
 * UNSIGNED, is relaxed about ENUM, and does not enforce column lengths. These
 * tests prove the application logic — request validation, permissions, business
 * rules, response shapes — not that the MySQL schema is exactly right. Migrations
 * are what define the real schema, and those are exercised by running
 * `npm run db:migrate` against MySQL.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-anywhere';
process.env.JWT_EXPIRES_IN = '15m';
process.env.BCRYPT_SALT_ROUNDS = '4'; // keep the suite fast; production uses 12
process.env.MAX_FAILED_LOGINS = '5';
process.env.LOCKOUT_MINUTES = '15';
process.env.API_PREFIX = '/api/v1';
// Every test signs in from the same address, far more often than a real office
// would. The per-account lockout — the protection that actually matters — is
// left at its production value and is exercised in auth.test.js.
process.env.LOGIN_RATE_LIMIT_MAX = '100000';
// Same reasoning for the public enquiry form: one test file submits several
// enquiries from the same address, far more than the production ceiling.
process.env.PUBLIC_ENQUIRY_RATE_LIMIT_MAX = '100000';
// File uploads write real bytes to real disk even under test — there is no
// in-memory equivalent for this the way SQLite stands in for MySQL. A small
// ceiling (2 KB) keeps the "too large" test's fixture tiny, and a directory
// of its own (removed in `afterAll` below) keeps test runs from leaving
// files in the `uploads/` a real deployment would actually use.
process.env.UPLOAD_MAX_BYTES = '2048';
process.env.UPLOAD_DIR = './uploads-test';

// Point the test config at SQLite before any model is loaded.
const config = require('../src/config/config');
config.test.dialect = 'sqlite';
config.test.storage = ':memory:';
delete config.test.charset;
delete config.test.collate;
delete config.test.dialectOptions;
delete config.test.timezone;
config.test.logging = false;

// SQLite has no UNSIGNED, so Sequelize warns once per column at model load.
// Expected and harmless; silencing it keeps real failures visible.
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('SQLite does not support')) return;
  originalWarn(...args);
};

const db = require('../src/models');

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterAll(async () => {
  await db.sequelize.close();
  // eslint-disable-next-line global-require -- only needed here, at teardown
  await require('fs/promises').rm(require('path').resolve(__dirname, '..', 'uploads-test'), {
    recursive: true,
    force: true,
  });
});
