'use strict';

const jwt = require('jsonwebtoken');

const { Operator } = require('../models');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken, OPERATOR_SCOPE } = require('../utils/tokens');

/**
 * Require a valid operator access token.
 *
 * The mirror of `authenticateTraveller`, kept separate for the same reason:
 * one middleware branching on subject type is one `if` away from letting an
 * operator into a traveller or staff route.
 *
 * On success `req.operator` holds the Operator and `req.auth` the claims.
 * `req.user` and `req.traveller` are deliberately left undefined.
 */
async function authenticateOperator(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing bearer token.', { code: 'NO_ACCESS_TOKEN' });
    }

    let claims;
    try {
      claims = verifyAccessToken(token, { scope: OPERATOR_SCOPE });
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

    const operator = await Operator.findByPk(claims.sub);
    if (!operator || !operator.isActive || !operator.portalEnabled) {
      throw ApiError.unauthorized('This account no longer has access.', {
        code: 'PORTAL_ACCESS_REVOKED',
      });
    }

    req.operator = operator;
    req.auth = claims;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticateOperator;
