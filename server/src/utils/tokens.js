'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');

const ACCESS_TOKEN_TYPE = 'access';

/**
 * Sign a short-lived access token. The client keeps this in memory only — it is
 * never written to localStorage, so an XSS bug cannot lift it off disk.
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      type: ACCESS_TOKEN_TYPE,
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.auth.accessTokenTtl,
      issuer: 'trailasia-api',
      audience: 'trailasia-client',
    }
  );
}

/** Verify an access token, throwing if it is expired, tampered with, or the wrong type. */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.auth.jwtSecret, {
    issuer: 'trailasia-api',
    audience: 'trailasia-client',
  });
  if (payload.type !== ACCESS_TOKEN_TYPE) {
    throw new jwt.JsonWebTokenError('Unexpected token type.');
  }
  return payload;
}

/**
 * Generate a refresh token: a random opaque string plus the hash we store.
 * The plaintext goes into the httpOnly cookie and is never persisted.
 */
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, tokenHash: hashRefreshToken(token) };
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Expiry timestamp for a newly issued refresh token. */
function refreshTokenExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.auth.refreshTokenTtlDays);
  return expires;
}

/** Seconds until an access token expires, for the client's refresh timer. */
function accessTokenLifetimeSeconds() {
  const decoded = jwt.decode(signAccessToken({ id: 0, role: 'consultant' }));
  return decoded.exp - decoded.iat;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  accessTokenLifetimeSeconds,
};
