'use strict';

const env = require('../config/env');
const travellerAuthService = require('../services/travellerAuth.service');
const travellerPortalService = require('../services/travellerPortal.service');

/**
 * The traveller refresh cookie.
 *
 * Its own name and its own path. The staff cookie is scoped to `/auth`, which
 * would include these routes, so sharing a name would mean whichever session
 * was established last silently overwrote the other — and a consultant testing
 * the traveller app would find themselves signed out of the portal with no
 * explanation.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: `${env.apiPrefix}/auth/traveller`,
    maxAge: env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function requestContext(req) {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

function sendSession(res, { refreshToken, ...payload }, status = 200) {
  res.cookie(env.auth.travellerRefreshCookieName, refreshToken, refreshCookieOptions());
  res.status(status).json({ data: payload });
}

async function activate(req, res, next) {
  try {
    const session = await travellerAuthService.activate(req.body, requestContext(req));
    sendSession(res, session, 201);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const session = await travellerAuthService.login(req.body, requestContext(req));
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const presented = req.cookies?.[env.auth.travellerRefreshCookieName];
    const session = await travellerAuthService.refresh(presented, requestContext(req));
    sendSession(res, session);
  } catch (error) {
    res.clearCookie(env.auth.travellerRefreshCookieName, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await travellerAuthService.logout(req.cookies?.[env.auth.travellerRefreshCookieName]);
    res.clearCookie(env.auth.travellerRefreshCookieName, {
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
    const session = await travellerAuthService.changePassword(
      req.traveller,
      req.body,
      requestContext(req)
    );
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

/** The signed-in traveller, with the trips they are on. */
async function me(req, res, next) {
  try {
    const trips = await travellerPortalService.listTrips(req.traveller.id);
    res.status(200).json({ data: { traveller: req.traveller.toSelfJSON(), trips } });
  } catch (error) {
    next(error);
  }
}

module.exports = { activate, login, refresh, logout, changePassword, me };
