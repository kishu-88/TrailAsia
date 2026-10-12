'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');

const ACCESS_TOKEN_TYPE = 'access';

/**
 * Who a token speaks for.
 *
 * This claim is not decoration. `sub` is a primary key, and staff and travellers
 * are numbered in separate tables — traveller 7 and user 7 both exist. Without a
 * scope, a traveller's token presented to a staff route would load whichever
 * staff account happens to share its id. Every token carries a scope, the
 * audience differs between the two, and every guard checks both before loading
 * a record.
 */
const STAFF_SCOPE = 'staff';
const TRAVELLER_SCOPE = 'traveller';
const OPERATOR_SCOPE = 'operator';
const STAFF_AUDIENCE = 'trailasia-client';
const TRAVELLER_AUDIENCE = 'trailasia-traveller';
const OPERATOR_AUDIENCE = 'trailasia-operator';

/**
 * Sign a short-lived access token. The client keeps this in memory only — it is
 * never written to localStorage, so an XSS bug cannot lift it off disk.
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      scope: STAFF_SCOPE,
      type: ACCESS_TOKEN_TYPE,
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.auth.accessTokenTtl,
      issuer: 'trailasia-api',
      audience: STAFF_AUDIENCE,
    }
  );
}

/**
 * Sign an access token for a traveller using the self-service portal.
 *
 * Deliberately no `role` claim. A traveller has no role in the staff sense, and
 * handing them a default one invites some future `requireRole` check to read it
 * as a staff role it recognises.
 */
function signTravellerAccessToken(traveller) {
  return jwt.sign(
    {
      sub: String(traveller.id),
      scope: TRAVELLER_SCOPE,
      type: ACCESS_TOKEN_TYPE,
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.auth.accessTokenTtl,
      issuer: 'trailasia-api',
      audience: TRAVELLER_AUDIENCE,
    }
  );
}

/**
 * Sign an access token for an operator using the self-service portal.
 *
 * Same shape as the traveller token, and for the same reason: no `role`
 * claim, so no staff-side check can mistake an operator for a recognised
 * staff role.
 */
function signOperatorAccessToken(operator) {
  return jwt.sign(
    {
      sub: String(operator.id),
      scope: OPERATOR_SCOPE,
      type: ACCESS_TOKEN_TYPE,
    },
    env.auth.jwtSecret,
    {
      expiresIn: env.auth.accessTokenTtl,
      issuer: 'trailasia-api',
      audience: OPERATOR_AUDIENCE,
    }
  );
}

const AUDIENCE_BY_SCOPE = {
  [TRAVELLER_SCOPE]: TRAVELLER_AUDIENCE,
  [OPERATOR_SCOPE]: OPERATOR_AUDIENCE,
  [STAFF_SCOPE]: STAFF_AUDIENCE,
};

/**
 * Verify an access token, throwing if it is expired, tampered with, of the wrong
 * type, or issued for a different scope than the caller expects.
 */
function verifyAccessToken(token, { scope = STAFF_SCOPE } = {}) {
  const payload = jwt.verify(token, env.auth.jwtSecret, {
    issuer: 'trailasia-api',
    audience: AUDIENCE_BY_SCOPE[scope] || STAFF_AUDIENCE,
  });
  if (payload.type !== ACCESS_TOKEN_TYPE) {
    throw new jwt.JsonWebTokenError('Unexpected token type.');
  }
  if (payload.scope !== scope) {
    throw new jwt.JsonWebTokenError('Token was issued for a different scope.');
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

/**
 * A single-use portal invitation: a random string handed to the traveller, and
 * the hash kept on their record. Same shape as a refresh token and for the same
 * reason — a dump of the travellers table must not hand anyone a way in.
 */
function generateInviteToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashRefreshToken(token) };
}

/** Expiry timestamp for a newly issued portal invitation. */
function inviteExpiry() {
  return new Date(Date.now() + env.auth.portalInviteTtlHours * 60 * 60 * 1000);
}

/** Seconds until an access token expires, for the client's refresh timer. */
function accessTokenLifetimeSeconds() {
  const decoded = jwt.decode(signAccessToken({ id: 0, role: 'consultant' }));
  return decoded.exp - decoded.iat;
}

module.exports = {
  STAFF_SCOPE,
  TRAVELLER_SCOPE,
  OPERATOR_SCOPE,
  signAccessToken,
  signTravellerAccessToken,
  signOperatorAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  generateInviteToken,
  inviteExpiry,
  accessTokenLifetimeSeconds,
};
