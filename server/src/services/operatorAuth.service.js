'use strict';

const bcrypt = require('bcryptjs');

const { Operator, RefreshToken, sequelize } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const mailerService = require('./mailer.service');
const {
  signOperatorAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  generateInviteToken,
  inviteExpiry,
  accessTokenLifetimeSeconds,
} = require('../utils/tokens');

/**
 * Authentication for ground operators using the self-service portal.
 *
 * A near-exact mirror of travellerAuth.service.js — same reasoning for
 * keeping it separate from auth.service.js (and from travellerAuth.service.js
 * itself) applies here: the flows look alike but a `subjectType` branch
 * threaded through one set of functions produces a file where every line
 * needs re-reading to know which kind of person it currently means. Token
 * generation, hashing and rotation stay shared, in utils/tokens.js, and all
 * three subject types share one session table.
 */

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeODtc6qgJZ2wQZ9J8fZDSHDgKxDsMoMUu';

async function issueRefreshToken(operatorId, context, transaction) {
  const { token, tokenHash } = generateRefreshToken();
  await RefreshToken.create(
    {
      subjectType: 'operator',
      operatorId,
      tokenHash,
      expiresAt: refreshTokenExpiry(),
      userAgent: context.userAgent ? String(context.userAgent).slice(0, 255) : null,
      ipAddress: context.ipAddress || null,
    },
    { transaction }
  );
  return token;
}

function sessionPayload(operator, refreshToken) {
  return {
    operator: operator.toSelfJSON(),
    accessToken: signOperatorAccessToken(operator),
    expiresIn: accessTokenLifetimeSeconds(),
    refreshToken,
  };
}

// --- Invitations (staff side) ----------------------------------------------

/**
 * Issue a portal invitation for an operator.
 *
 * Returns the plaintext token exactly once — same as the traveller invite —
 * so staff can still copy/paste it as a fallback, but it is now also
 * emailed to the operator's contact address, best-effort, the same way the
 * traveller invite is.
 */
async function issueInvite(operatorId) {
  const operator = await Operator.scope('withCredentials').findByPk(operatorId);
  if (!operator) throw ApiError.notFound('Operator not found.');

  if (!operator.isActive) {
    throw ApiError.badRequest('This operator record is deactivated.', {
      code: 'OPERATOR_INACTIVE',
    });
  }
  if (!operator.contactEmail) {
    throw ApiError.badRequest(
      'This operator has no contact email, so there is nothing to sign in with.',
      { code: 'NO_EMAIL', details: { contactEmail: 'Add a contact email first.' } }
    );
  }
  if (operator.portalActivatedAt && operator.passwordHash) {
    throw ApiError.badRequest(
      'This operator already has portal access. Revoke it first if they need a new invitation.',
      { code: 'PORTAL_ALREADY_ACTIVE' }
    );
  }

  const { token, tokenHash } = generateInviteToken();
  await operator.update({
    inviteTokenHash: tokenHash,
    inviteExpiresAt: inviteExpiry(),
    inviteSentAt: new Date(),
    portalEnabled: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  // See the matching comment in travellerAuth.service.js's issueInvite:
  // guarded so a broken mailer can never turn a successful invite into a
  // failed response.
  try {
    const activationUrl = `${env.clientOrigin}/operator/activate?token=${token}`;
    await mailerService.sendEmail({
      to: operator.contactEmail,
      subject: 'TrailAsia operator portal access',
      text:
        `Hi ${operator.contactName || operator.name},\n\n` +
        `TrailAsia has set up portal access for ${operator.name} to view and respond to ` +
        `confirmation requests directly.\n\n` +
        `${activationUrl}\n\n` +
        `This link works once and expires in ${env.auth.portalInviteTtlHours} hours. ` +
        `If you weren't expecting this, you can ignore it.`,
      context: 'portal_invite:operator',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not email the portal invite:', error.message);
  }

  return {
    operator: operator.toPublicJSON(),
    inviteToken: token,
    expiresAt: operator.inviteExpiresAt,
    expiresInHours: env.auth.portalInviteTtlHours,
  };
}

/** Withdraw portal access. Every live session goes with it. */
async function revokeAccess(operatorId) {
  const operator = await Operator.scope('withCredentials').findByPk(operatorId);
  if (!operator) throw ApiError.notFound('Operator not found.');

  await sequelize.transaction(async (transaction) => {
    await operator.update(
      {
        portalEnabled: false,
        passwordHash: null,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        portalActivatedAt: null,
      },
      { transaction }
    );
    await RefreshToken.update(
      { revokedAt: new Date() },
      {
        where: { subjectType: 'operator', operatorId: operator.id, revokedAt: null },
        transaction,
      }
    );
  });

  return operator.toPublicJSON();
}

// --- Activation and sign-in (operator side) --------------------------------

async function activate({ token, password }, context = {}) {
  const tokenHash = hashRefreshToken(token);
  const operator = await Operator.scope('withCredentials').findOne({
    where: { inviteTokenHash: tokenHash },
  });

  if (!operator) {
    throw ApiError.unauthorized('That invitation is not valid. Ask the agency for a new one.', {
      code: 'INVALID_INVITE',
    });
  }
  if (!operator.inviteExpiresAt || operator.inviteExpiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('That invitation has expired. Ask the agency for a new one.', {
      code: 'INVITE_EXPIRED',
    });
  }
  if (!operator.isActive) {
    throw ApiError.forbidden('This account is not available.', { code: 'OPERATOR_INACTIVE' });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await operator.update(
      {
        passwordHash: await Operator.hashPassword(password),
        inviteTokenHash: null,
        inviteExpiresAt: null,
        portalEnabled: true,
        portalActivatedAt: new Date(),
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      { transaction }
    );
    return issueRefreshToken(operator.id, context, transaction);
  });

  return sessionPayload(operator, refreshToken);
}

async function login({ email, password }, context = {}) {
  const operator = await Operator.scope('withCredentials').findOne({
    where: { contactEmail: email },
  });

  if (!operator || !operator.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  if (operator.isLocked()) {
    const minutes = Math.ceil((operator.lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Too many attempts. Try again in ${minutes} minute(s), or call the agency.`,
      { code: 'ACCOUNT_LOCKED' }
    );
  }

  if (!operator.canUsePortal()) {
    throw ApiError.forbidden('This account no longer has access. Contact the agency.', {
      code: 'PORTAL_ACCESS_REVOKED',
    });
  }

  if (!(await operator.verifyPassword(password))) {
    const attempts = operator.failedLoginAttempts + 1;
    const updates = { failedLoginAttempts: attempts };
    if (attempts >= env.auth.maxFailedLogins) {
      updates.lockedUntil = new Date(Date.now() + env.auth.lockoutMinutes * 60000);
      updates.failedLoginAttempts = 0;
    }
    await operator.update(updates);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await operator.update(
      { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      { transaction }
    );
    return issueRefreshToken(operator.id, context, transaction);
  });

  return sessionPayload(operator, refreshToken);
}

/** Rotate an operator refresh token. Reuse of a rotated token revokes everything. */
async function refresh(presentedToken, context = {}) {
  if (!presentedToken) {
    throw ApiError.unauthorized('No session to refresh.', { code: 'NO_REFRESH_TOKEN' });
  }

  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await RefreshToken.findOne({
    where: { tokenHash, subjectType: 'operator' },
  });

  if (!existing) {
    throw ApiError.unauthorized('Session is no longer valid. Please sign in again.', {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  if (existing.revokedAt) {
    await revokeAllForOperator(existing.operatorId);
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

  const operator = await Operator.scope('withCredentials').findByPk(existing.operatorId);
  if (!operator || !operator.canUsePortal()) {
    await revokeAllForOperator(existing.operatorId);
    throw ApiError.forbidden('This account no longer has access.', {
      code: 'PORTAL_ACCESS_REVOKED',
    });
  }

  const newToken = await sequelize.transaction(async (transaction) => {
    const token = await issueRefreshToken(operator.id, context, transaction);
    await existing.update(
      { revokedAt: new Date(), replacedByHash: hashRefreshToken(token) },
      { transaction }
    );
    return token;
  });

  return sessionPayload(operator, newToken);
}

async function logout(presentedToken) {
  if (!presentedToken) return;
  const tokenHash = hashRefreshToken(presentedToken);
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash, subjectType: 'operator', revokedAt: null } }
  );
}

async function changePassword(operator, { currentPassword, newPassword }, context = {}) {
  const withHash = await Operator.scope('withCredentials').findByPk(operator.id);

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
      { passwordHash: await Operator.hashPassword(newPassword) },
      { transaction }
    );
    await RefreshToken.update(
      { revokedAt: new Date() },
      {
        where: { subjectType: 'operator', operatorId: withHash.id, revokedAt: null },
        transaction,
      }
    );
    return issueRefreshToken(withHash.id, context, transaction);
  });

  return sessionPayload(withHash, refreshToken);
}

async function revokeAllForOperator(operatorId) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { subjectType: 'operator', operatorId, revokedAt: null } }
  );
}

module.exports = {
  issueInvite,
  revokeAccess,
  activate,
  login,
  refresh,
  logout,
  changePassword,
  revokeAllForOperator,
};
