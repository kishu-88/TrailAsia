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
    bcryptSaltRounds: int('BCRYPT_SALT_ROUNDS', 12),
    // Brute-force protection on the login endpoint.
    maxFailedLogins: int('MAX_FAILED_LOGINS', 5),
    lockoutMinutes: int('LOCKOUT_MINUTES', 15),
    // Coarse per-IP throttle. Configurable because the test suite signs in far
    // more often from one address than any real office ever would.
    loginRateLimitMax: int('LOGIN_RATE_LIMIT_MAX', 20),
    loginRateLimitWindowMinutes: int('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15),
  },

  seed: {
    adminEmail: optional('SEED_ADMIN_EMAIL', ''),
    adminPassword: optional('SEED_ADMIN_PASSWORD', ''),
  },
};

module.exports = env;
