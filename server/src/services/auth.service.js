'use strict';

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { User, RefreshToken, sequelize } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  accessTokenLifetimeSeconds,
} = require('../utils/tokens');

/**
 * All authentication business rules live here. Controllers only translate
 * between HTTP and these functions.
 */

/** Deliberately identical message for unknown email and wrong password. */
const INVALID_CREDENTIALS = 'Email or password is incorrect.';

/**
 * A real bcrypt hash of a value nobody knows, compared against when the email is
 * not found. Without it an unknown address returns noticeably faster than a
 * wrong password, which turns the login form into a way to test whether someone
 * works at the agency.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeODtc6qgJZ2wQZ9J8fZDSHDgKxDsMoMUu';

async function issueRefreshToken(userId, context, transaction) {
  const { token, tokenHash } = generateRefreshToken();
  await RefreshToken.create(
    {
      subjectType: 'staff',
      userId,
      tokenHash,
      expiresAt: refreshTokenExpiry(),
      userAgent: context.userAgent ? String(context.userAgent).slice(0, 255) : null,
      ipAddress: context.ipAddress || null,
    },
    { transaction }
  );
  return token;
}

/**
 * Verify credentials and start a session.
 *
 * Repeated failures lock the account for a cooling-off period. The lock is per
 * account rather than per IP, because the thing being protected is the account.
 */
async function login({ email, password }, context = {}) {
  const user = await User.scope('withPassword').findOne({ where: { email } });

  if (!user) {
    // Burn the same time a real comparison would take, then give the same
    // answer as a wrong password. The endpoint must not confirm who has an account.
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  if (user.isLocked()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Account temporarily locked after repeated failed sign-ins. Try again in ${minutes} minute(s).`,
      { code: 'ACCOUNT_LOCKED' }
    );
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.', {
      code: 'ACCOUNT_INACTIVE',
    });
  }

  const passwordMatches = await user.verifyPassword(password);

  if (!passwordMatches) {
    const attempts = user.failedLoginAttempts + 1;
    const updates = { failedLoginAttempts: attempts };
    if (attempts >= env.auth.maxFailedLogins) {
      updates.lockedUntil = new Date(Date.now() + env.auth.lockoutMinutes * 60000);
      updates.failedLoginAttempts = 0;
    }
    await user.update(updates);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await user.update(
      { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      { transaction }
    );
    return issueRefreshToken(user.id, context, transaction);
  });

  return {
    user: user.toPublicJSON(),
    accessToken: signAccessToken(user),
    expiresIn: accessTokenLifetimeSeconds(),
    refreshToken,
  };
}

/**
 * Exchange a refresh token for a new access token, rotating the refresh token.
 *
 * If a token that has already been rotated away is presented, that is a strong
 * signal it was stolen — every session for the user is revoked rather than
 * quietly issuing a new pair.
 */
async function refresh(presentedToken, context = {}) {
  if (!presentedToken) {
    throw ApiError.unauthorized('No session to refresh.', { code: 'NO_REFRESH_TOKEN' });
  }

  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await RefreshToken.findOne({
    // Staff and travellers share this table, so the subject type is part of the
    // lookup, not something checked afterwards. Without it a traveller's cookie
    // presented here would reach `revokeAllForUser(null)` below, which matches
    // every traveller session at once.
    where: { tokenHash, subjectType: 'staff' },
  });

  if (!existing) {
    throw ApiError.unauthorized('Session is no longer valid. Please sign in again.', {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  if (existing.revokedAt) {
    await revokeAllForUser(existing.userId);
    throw ApiError.unauthorized(
      'This session was already ended. For your security all sessions have been signed out.',
      { code: 'REFRESH_TOKEN_REUSED' }
    );
  }

  if (!existing.isActive()) {
    throw ApiError.unauthorized('Session has expired. Please sign in again.', {
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  }

  const user = await User.findByPk(existing.userId);
  if (!user || !user.isActive) {
    await revokeAllForUser(existing.userId);
    throw ApiError.forbidden('This account is no longer active.', {
      code: 'ACCOUNT_INACTIVE',
    });
  }

  const newToken = await sequelize.transaction(async (transaction) => {
    const token = await issueRefreshToken(user.id, context, transaction);
    await existing.update(
      { revokedAt: new Date(), replacedByHash: hashRefreshToken(token) },
      { transaction }
    );
    return token;
  });

  return {
    user: user.toPublicJSON(),
    accessToken: signAccessToken(user),
    expiresIn: accessTokenLifetimeSeconds(),
    refreshToken: newToken,
  };
}

/** End the current session. Unknown or already-revoked tokens are a no-op. */
async function logout(presentedToken) {
  if (!presentedToken) return;
  const tokenHash = hashRefreshToken(presentedToken);
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash, revokedAt: null } }
  );
}

/**
 * Change your own password.
 *
 * Requires the current password, so someone who walks up to an unlocked laptop
 * cannot lock the real owner out. Every other session is revoked afterwards —
 * if the reason for changing it was that the old one leaked, leaving other
 * sessions alive defeats the point. The current session survives via a freshly
 * issued refresh token.
 */
async function changePassword(user, { currentPassword, newPassword }, context = {}) {
  const withHash = await User.scope('withPassword').findByPk(user.id);

  if (!(await withHash.verifyPassword(currentPassword))) {
    throw ApiError.unauthorized('Your current password is not correct.', {
      code: 'INVALID_CURRENT_PASSWORD',
      details: { currentPassword: 'Not correct.' },
    });
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('The new password must be different from the current one.', {
      code: 'PASSWORD_UNCHANGED',
      details: { newPassword: 'Choose a different password.' },
    });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await withHash.update(
      { passwordHash: await User.hashPassword(newPassword) },
      { transaction }
    );
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { subjectType: 'staff', userId: user.id, revokedAt: null }, transaction }
    );
    return issueRefreshToken(user.id, context, transaction);
  });

  return {
    user: withHash.toPublicJSON(),
    accessToken: signAccessToken(withHash),
    expiresIn: accessTokenLifetimeSeconds(),
    refreshToken,
  };
}

/** Revoke every active session for a user — password change, deactivation, suspected theft. */
async function revokeAllForUser(userId) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { subjectType: 'staff', userId, revokedAt: null } }
  );
}

/** Housekeeping: drop rows that expired a while ago. Called by a scheduled job. */
async function purgeExpiredTokens(olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  return RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: cutoff } } });
}

module.exports = {
  login,
  refresh,
  logout,
  changePassword,
  revokeAllForUser,
  purgeExpiredTokens,
};
