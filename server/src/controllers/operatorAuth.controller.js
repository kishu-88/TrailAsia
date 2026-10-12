'use strict';

const env = require('../config/env');
const operatorAuthService = require('../services/operatorAuth.service');

/**
 * The operator refresh cookie.
 *
 * Its own name and its own path, same reasoning as the traveller cookie:
 * without one, whichever portal session was established last would silently
 * overwrite the other in a browser that has both open.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: `${env.apiPrefix}/auth/operator`,
    maxAge: env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function requestContext(req) {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

function sendSession(res, { refreshToken, ...payload }, status = 200) {
  res.cookie(env.auth.operatorRefreshCookieName, refreshToken, refreshCookieOptions());
  res.status(status).json({ data: payload });
}

async function activate(req, res, next) {
  try {
    const session = await operatorAuthService.activate(req.body, requestContext(req));
    sendSession(res, session, 201);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const session = await operatorAuthService.login(req.body, requestContext(req));
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const presented = req.cookies?.[env.auth.operatorRefreshCookieName];
    const session = await operatorAuthService.refresh(presented, requestContext(req));
    sendSession(res, session);
  } catch (error) {
    res.clearCookie(env.auth.operatorRefreshCookieName, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await operatorAuthService.logout(req.cookies?.[env.auth.operatorRefreshCookieName]);
    res.clearCookie(env.auth.operatorRefreshCookieName, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const session = await operatorAuthService.changePassword(
      req.operator,
      req.body,
      requestContext(req)
    );
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    res.status(200).json({ data: { operator: req.operator.toSelfJSON() } });
  } catch (error) {
    next(error);
  }
}

module.exports = { activate, login, refresh, logout, changePassword, me };
