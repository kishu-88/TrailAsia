'use strict';

require('dotenv').config();

/**
 * Central environment access. Everything else in the codebase reads config from
 * here rather than touching process.env directly, so a missing variable fails
 * loudly at boot instead of quietly at 2am during a booking.
 */

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function bool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${value}".`);
  }
  return parsed;
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',

  port: int('PORT', 4000),
  apiPrefix: optional('API_PREFIX', '/api/v1'),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),
  // Where travellers sign in. Set this to TrailAsia Book's address
  // (http://localhost:5174 in development) and invitation links point at
  // its /activate page. Left blank, they point at the phone-shaped traveller
  // screens inside the staff client, as they always have — so a checkout
  // that only runs this repo still produces a link that works.
  travellerPortalUrl: optional('TRAVELLER_PORTAL_URL', ''),
  logLevel: optional('LOG_LEVEL', 'dev'),

  db: {
    host: optional('DB_HOST', 'localhost'),
    port: int('DB_PORT', 3306),
    name: optional('DB_NAME', 'trailasia'),
    user: optional('DB_USER', 'root'),
    password: optional('DB_PASSWORD', ''),
    connectionLimit: int('DB_CONNECTION_LIMIT', 10),
    ssl: bool('DB_SSL', false),
  },

  auth: {
    // Access tokens are short-lived JWTs held in memory by the browser.
    jwtSecret: required('JWT_SECRET'),
    accessTokenTtl: optional('JWT_EXPIRES_IN', '15m'),
    // Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
    refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
    refreshCookieName: optional('REFRESH_COOKIE_NAME', 'trailasia_rt'),
    // Travellers get their own cookie name and their own cookie path, so a
    // consultant checking the traveller app in the same browser cannot end up
    // holding one session in the slot meant for the other.
    travellerRefreshCookieName: optional(
      'TRAVELLER_REFRESH_COOKIE_NAME',
      `${optional('REFRESH_COOKIE_NAME', 'trailasia_rt')}_traveller`
    ),
    // Same reasoning as the traveller cookie above, for the operator portal.
    operatorRefreshCookieName: optional(
      'OPERATOR_REFRESH_COOKIE_NAME',
      `${optional('REFRESH_COOKIE_NAME', 'trailasia_rt')}_operator`
    ),
    // How long a portal invitation stays usable. Short enough that a link
    // forwarded to the wrong address does not stay live for a month.
    portalInviteTtlHours: int('PORTAL_INVITE_TTL_HOURS', 72),
    bcryptSaltRounds: int('BCRYPT_SALT_ROUNDS', 12),
    // Brute-force protection on the login endpoint.
    maxFailedLogins: int('MAX_FAILED_LOGINS', 5),
    lockoutMinutes: int('LOCKOUT_MINUTES', 15),
    // Coarse per-IP throttle. Configurable because the test suite signs in far
    // more often from one address than any real office ever would.
    loginRateLimitMax: int('LOGIN_RATE_LIMIT_MAX', 20),
    loginRateLimitWindowMinutes: int('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15),
  },

  safety: {
    // Privacy Act 1988, APP 11: location records are kept only while they are
    // needed. Pings are purged this many days after the trip ends.
    locationRetentionDays: int('LOCATION_RETENTION_DAYS', 30),
    sosEscalationEmail: optional('SOS_ESCALATION_EMAIL', ''),
    // How long an SOS can sit raised with nobody assigned before the
    // scheduled sweep (jobs/sosEscalation.js) re-notifies every trip editor.
    // Minutes, not days or hours like every other reminder in this codebase —
    // an SOS is the one thing here where "overnight" is already a failure.
    sosEscalationMinutes: int('SOS_ESCALATION_MINUTES', 5),
    // A phone reporting its position every second would fill the table with
    // nothing useful. Anything closer together than this is quietly dropped.
    minPingIntervalSeconds: int('MIN_PING_INTERVAL_SECONDS', 30),
  },

  email: {
    // Mailgun. Unset by default — the app runs fine with no mail transport
    // at all, the same as it already does with no object storage and no SMS
    // provider; `mailer.service.js` logs instead of sending when `enabled`
    // is false. Set both to turn real email on.
    mailgunApiKey: optional('MAILGUN_API_KEY', ''),
    mailgunDomain: optional('MAILGUN_DOMAIN', ''),
    from: optional('MAILGUN_FROM', 'TrailAsia <no-reply@trailasia.local>'),
    get enabled() {
      return Boolean(this.mailgunApiKey && this.mailgunDomain);
    },
  },

  payments: {
    // How many days out an instalment starts appearing in the "due soon"
    // reminder. Long enough that finance has time to chase a bank transfer
    // before it is actually late.
    reminderLeadDays: int('PAYMENT_REMINDER_LEAD_DAYS', 7),
  },

  publicEnquiry: {
    // Who a booking enquiry submitted through the public site (TrailAsia
    // Book) lands with. Unset by default — falls back at request time to the
    // first active consultant, then the first active admin, rather than
    // failing to boot over a missing id that will not exist until staff are
    // seeded anyway.
    defaultConsultantId: optional('PUBLIC_ENQUIRY_CONSULTANT_ID', ''),
    // No per-account lockout is possible here — there is no account — so the
    // per-IP ceiling is the only brake on the public enquiry form.
    rateLimitMax: int('PUBLIC_ENQUIRY_RATE_LIMIT_MAX', 10),
    rateLimitWindowMinutes: int('PUBLIC_ENQUIRY_RATE_LIMIT_WINDOW_MINUTES', 15),
  },

  seed: {
    adminEmail: optional('SEED_ADMIN_EMAIL', ''),
    adminPassword: optional('SEED_ADMIN_PASSWORD', ''),
  },

  uploads: {
    // Where document uploads (passports, insurance policies) land on disk.
    // These three settings were reserved in .env.example since the scaffold
    // phase, for exactly this feature — `fileStorage.service.js` is the
    // first thing to actually read them. Outside `src/` on purpose, so the
    // directory survives a deploy that replaces the app code, and is the one
    // thing that needs backing up beyond the database. Not S3 — there is no
    // object storage account for this agency yet — but isolated behind this
    // one setting so switching to one later is a `fileStorage.service.js`
    // change, not a hunt through every route that touches a document.
    dir: optional('UPLOAD_DIR', './uploads'),
    // Generous enough for a scanned passport photo, tight enough that a
    // traveller's connection times out before the request does.
    maxBytes: int('UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
    allowedTypes: optional('UPLOAD_ALLOWED_TYPES', 'application/pdf,image/png,image/jpeg')
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean),
  },
};

module.exports = env;
