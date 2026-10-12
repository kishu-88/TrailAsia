'use strict';

const jwt = require('jsonwebtoken');

const { Traveller } = require('../models');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken, TRAVELLER_SCOPE } = require('../utils/tokens');

/**
 * Require a valid traveller access token.
 *
 * The mirror of `authenticate`, and separate from it on purpose. A single
 * middleware that accepted either and branched would be one `if` away from
 * letting a traveller into a staff route, and that `if` would sit in the middle
 * of the only code path every request goes through.
 *
 * On success `req.traveller` holds the Traveller and `req.auth` the claims.
 * `req.user` is deliberately left undefined, so `requireRole` — which refuses
 * without it — cannot accidentally pass a traveller through.
 */
async function authenticateTraveller(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing bearer token.', { code: 'NO_ACCESS_TOKEN' });
    }

    let claims;
    try {
      claims = verifyAccessToken(token, { scope: TRAVELLER_SCOPE });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Access token has expired.', {
          code: 'ACCESS_TOKEN_EXPIRED',
        });
      }
      throw ApiError.unauthorized('Access token is not valid.', {
        code: 'INVALID_ACCESS_TOKEN',
      });
    }

    // Loaded fresh every request, so revoking portal access takes effect now
    // rather than whenever the current access token happens to expire.
    const traveller = await Traveller.findByPk(claims.sub);
    if (!traveller || !traveller.isActive || !traveller.portalEnabled) {
      throw ApiError.unauthorized('This account no longer has access.', {
        code: 'PORTAL_ACCESS_REVOKED',
      });
    }

    req.traveller = traveller;
    req.auth = claims;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticateTraveller;
