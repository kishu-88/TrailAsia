'use strict';

const env = require('../config/env');
const authService = require('../services/auth.service');

/**
 * Cookie options for the refresh token.
 *
 * httpOnly    — JavaScript on the page cannot read it, so XSS cannot steal it.
 * sameSite    — 'lax' is fine while the client and API share a site (different
 *               ports on localhost, or the same domain in production). If the
 *               API ever moves to a different registrable domain, this must
 *               become 'none' with secure: true.
 * path        — scoped to the auth routes so it is not attached to every request.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: `${env.apiPrefix}/auth`,
    maxAge: env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function requestContext(req) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  };
}

async function login(req, res, next) {
  try {
    const { refreshToken, ...payload } = await authService.login(
      req.body,
      requestContext(req)
    );
    res.cookie(env.auth.refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(200).json({ data: payload });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const presented = req.cookies?.[env.auth.refreshCookieName];
    const { refreshToken, ...payload } = await authService.refresh(
      presented,
      requestContext(req)
    );
    res.cookie(env.auth.refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(200).json({ data: payload });
  } catch (error) {
    // A failed refresh means the cookie is worthless — clear it either way.
    res.clearCookie(env.auth.refreshCookieName, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.cookies?.[env.auth.refreshCookieName]);
    res.clearCookie(env.auth.refreshCookieName, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/** The signed-in user, resolved by the authenticate middleware. */
async function me(req, res) {
  res.status(200).json({ data: { user: req.user.toPublicJSON() } });
}

async function changePassword(req, res, next) {
  try {
    const { refreshToken, ...payload } = await authService.changePassword(
      req.user,
      req.body,
      requestContext(req)
    );
    // Every other session was revoked; replace this one's cookie so the person
    // changing their password is not signed out of the tab they are sitting in.
    res.cookie(env.auth.refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(200).json({ data: payload });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, refresh, logout, me, changePassword };
