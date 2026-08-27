'use strict';

const jwt = require('jsonwebtoken');

const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Require a valid access token.
 *
 * On success `req.user` holds the User instance and `req.auth` the raw claims.
 * The user is loaded on every request rather than trusted from the token alone,
 * so deactivating an account takes effect immediately instead of at token expiry.
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing bearer token.', { code: 'NO_ACCESS_TOKEN' });
    }

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        // The client watches for this code and silently calls /auth/refresh.
        throw ApiError.unauthorized('Access token has expired.', {
          code: 'ACCESS_TOKEN_EXPIRED',
        });
      }
      throw ApiError.unauthorized('Access token is not valid.', {
        code: 'INVALID_ACCESS_TOKEN',
      });
    }

    const user = await User.findByPk(claims.sub);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('This account is no longer active.', {
        code: 'ACCOUNT_INACTIVE',
      });
    }

    req.user = user;
    req.auth = claims;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticate;
