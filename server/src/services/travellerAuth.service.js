'use strict';

const bcrypt = require('bcryptjs');

const { Traveller, RefreshToken, sequelize } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notification.service');
const mailerService = require('./mailer.service');
const {
  signTravellerAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  generateInviteToken,
  inviteExpiry,
  accessTokenLifetimeSeconds,
} = require('../utils/tokens');

/**
 * Authentication for travellers using the self-service portal.
 *
 * Kept apart from auth.service.js rather than merged into it. The two flows look
 * similar but differ where it matters — there is no self-registration, no role,
 * no password reset by email (the agency has no mail transport yet), and access
 * is granted by a consultant and revocable by one. Folding both into a single
 * set of functions with a `subjectType` argument produced a file where every
 * branch needed re-reading to decide which kind of person it applied to.
 *
 * What is shared is the part that must never diverge: token generation, hashing
 * and rotation, in utils/tokens.js, and one session table.
 */

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeODtc6qgJZ2wQZ9J8fZDSHDgKxDsMoMUu';

const CONSENT_UNRELATED = 'Signing in does not share your location. That is a separate choice.';

async function issueRefreshToken(travellerId, context, transaction) {
  const { token, tokenHash } = generateRefreshToken();
  await RefreshToken.create(
    {
      subjectType: 'traveller',
      travellerId,
      tokenHash,
      expiresAt: refreshTokenExpiry(),
      userAgent: context.userAgent ? String(context.userAgent).slice(0, 255) : null,
      ipAddress: context.ipAddress || null,
    },
    { transaction }
  );
  return token;
}

function sessionPayload(traveller, refreshToken) {
  return {
    traveller: traveller.toSelfJSON(),
    accessToken: signTravellerAccessToken(traveller),
    expiresIn: accessTokenLifetimeSeconds(),
    refreshToken,
    notice: CONSENT_UNRELATED,
  };
}

// --- Invitations (staff side) ----------------------------------------------

/**
 * The link a traveller opens to set their password.
 *
 * Built here, once, and returned to the caller, so the address in the email
 * and the one staff copy from the dialog cannot be two different links to
 * two different apps. TrailAsia Book when it is configured as the traveller
 * portal; otherwise the traveller screens inside the staff client.
 */
function activationUrlFor(token) {
  const portal = env.travellerPortalUrl.replace(/\/+$/, '');
  return portal
    ? `${portal}/activate?token=${token}`
    : `${env.clientOrigin}/trip/activate?token=${token}`;
}

/**
 * Issue a portal invitation for a traveller.
 *
 * Returns the plaintext token exactly once, same as before Mailgun was wired
 * in — the UI still shows it so staff can copy/paste as a fallback (no
 * confirmation the traveller's inbox is being checked, a wrong address
 * typo'd into the record, Mailgun being down) — but this now also emails the
 * activation link itself, best-effort, so the common case no longer depends
 * on a consultant relaying it by hand.
 *
 * Re-inviting an already-active traveller is refused. Someone who has set a
 * password and can sign in does not need an invitation, and issuing one anyway
 * is a way to hand a live account to whoever asked for the link.
 */
async function issueInvite(travellerId) {
  const traveller = await Traveller.scope('withCredentials').findByPk(travellerId);
  if (!traveller) throw ApiError.notFound('Traveller not found.');

  if (!traveller.isActive) {
    throw ApiError.badRequest('This traveller record is deactivated.', {
      code: 'TRAVELLER_INACTIVE',
    });
  }
  if (!traveller.email) {
    throw ApiError.badRequest(
      'This traveller has no email address, so there is nothing to sign in with.',
      { code: 'NO_EMAIL', details: { email: 'Add an email address first.' } }
    );
  }
  if (traveller.portalActivatedAt && traveller.passwordHash) {
    throw ApiError.badRequest(
      'This traveller already has portal access. Revoke it first if they need a new invitation.',
      { code: 'PORTAL_ALREADY_ACTIVE' }
    );
  }

  const { token, tokenHash } = generateInviteToken();
  await traveller.update({
    inviteTokenHash: tokenHash,
    inviteExpiresAt: inviteExpiry(),
    inviteSentAt: new Date(),
    // Enabled now so that activation is the only remaining step; nothing can be
    // done with the flag until a password exists.
    portalEnabled: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  // The token is already minted and stored at this point, so the invite has
  // already succeeded — mailerService.sendEmail never throws on its own,
  // but this call is guarded anyway, same reasoning as notify()'s own email
  // step: nothing about delivering the email is allowed to turn into a
  // failed invite response once the real work is done.
  const activationUrl = activationUrlFor(token);
  let emailed = false;
  try {
    const result = await mailerService.sendEmail({
      to: traveller.email,
      subject: 'Your TrailAsia trip portal is ready',
      text:
        `Hi ${traveller.firstName},\n\n` +
        `You can now sign in to see your trip, upload documents, and reach us from your phone.\n\n` +
        `${activationUrl}\n\n` +
        `This link works once and expires in ${env.auth.portalInviteTtlHours} hours. ` +
        `If you weren't expecting this, you can ignore it.`,
      context: 'portal_invite:traveller',
    });
    emailed = Boolean(result && result.sent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not email the portal invite:', error.message);
  }

  return {
    traveller: traveller.toPublicJSON(),
    inviteToken: token,
    activationUrl,
    // Whether the link actually went out by email, so the dialog can tell
    // staff the truth about whether they still need to pass it on.
    emailed,
    expiresAt: traveller.inviteExpiresAt,
    expiresInHours: env.auth.portalInviteTtlHours,
  };
}

/**
 * Withdraw portal access.
 *
 * Every live session goes with it. Access that survives until a token expires is
 * not revoked, it is delayed, and the reason for revoking is usually that the
 * delay is the problem.
 */
async function revokeAccess(travellerId) {
  const traveller = await Traveller.scope('withCredentials').findByPk(travellerId);
  if (!traveller) throw ApiError.notFound('Traveller not found.');

  await sequelize.transaction(async (transaction) => {
    await traveller.update(
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
        where: { subjectType: 'traveller', travellerId: traveller.id, revokedAt: null },
        transaction,
      }
    );
  });

  return traveller.toPublicJSON();
}

// --- Activation and sign-in (traveller side) -------------------------------

/** Exchange an invitation for a password. One use, then the token is discarded. */
async function activate({ token, password }, context = {}) {
  const tokenHash = hashRefreshToken(token);
  const traveller = await Traveller.scope('withCredentials').findOne({
    where: { inviteTokenHash: tokenHash },
  });

  if (!traveller) {
    throw ApiError.unauthorized('That invitation is not valid. Ask the agency for a new one.', {
      code: 'INVALID_INVITE',
    });
  }
  if (!traveller.inviteExpiresAt || traveller.inviteExpiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('That invitation has expired. Ask the agency for a new one.', {
      code: 'INVITE_EXPIRED',
    });
  }
  if (!traveller.isActive) {
    throw ApiError.forbidden('This account is not available.', { code: 'TRAVELLER_INACTIVE' });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await traveller.update(
      {
        passwordHash: await Traveller.hashPassword(password),
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
    return issueRefreshToken(traveller.id, context, transaction);
  });

  await notificationService.portalActivated(traveller);

  return sessionPayload(traveller, refreshToken);
}

/**
 * Sign in.
 *
 * Same shape as the staff flow, including the dummy hash comparison for an
 * unknown address. The reason is stronger here, not weaker: the thing an
 * attacker would learn from a fast "no such account" is whether a named person
 * is travelling, and where.
 */
async function login({ email, password }, context = {}) {
  const traveller = await Traveller.scope('withCredentials').findOne({ where: { email } });

  if (!traveller || !traveller.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  if (traveller.isLocked()) {
    const minutes = Math.ceil((traveller.lockedUntil.getTime() - Date.now()) / 60000);
    throw ApiError.forbidden(
      `Too many attempts. Try again in ${minutes} minute(s), or call the agency.`,
      { code: 'ACCOUNT_LOCKED' }
    );
  }

  if (!traveller.canUsePortal()) {
    throw ApiError.forbidden('This account no longer has access. Contact the agency.', {
      code: 'PORTAL_ACCESS_REVOKED',
    });
  }

  if (!(await traveller.verifyPassword(password))) {
    const attempts = traveller.failedLoginAttempts + 1;
    const updates = { failedLoginAttempts: attempts };
    if (attempts >= env.auth.maxFailedLogins) {
      updates.lockedUntil = new Date(Date.now() + env.auth.lockoutMinutes * 60000);
      updates.failedLoginAttempts = 0;
    }
    await traveller.update(updates);
    throw ApiError.unauthorized(INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
  }

  const refreshToken = await sequelize.transaction(async (transaction) => {
    await traveller.update(
      { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      { transaction }
    );
    return issueRefreshToken(traveller.id, context, transaction);
  });

  return sessionPayload(traveller, refreshToken);
}

/** Rotate a traveller refresh token. Reuse of a rotated token revokes everything. */
async function refresh(presentedToken, context = {}) {
  if (!presentedToken) {
    throw ApiError.unauthorized('No session to refresh.', { code: 'NO_REFRESH_TOKEN' });
  }

  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await RefreshToken.findOne({
    where: { tokenHash, subjectType: 'traveller' },
  });

  if (!existing) {
    throw ApiError.unauthorized('Session is no longer valid. Please sign in again.', {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  if (existing.revokedAt) {
    await revokeAllForTraveller(existing.travellerId);
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

  const traveller = await Traveller.scope('withCredentials').findByPk(existing.travellerId);
  if (!traveller || !traveller.canUsePortal()) {
    await revokeAllForTraveller(existing.travellerId);
    throw ApiError.forbidden('This account no longer has access.', {
      code: 'PORTAL_ACCESS_REVOKED',
    });
  }

  const newToken = await sequelize.transaction(async (transaction) => {
    const token = await issueRefreshToken(traveller.id, context, transaction);
    await existing.update(
      { revokedAt: new Date(), replacedByHash: hashRefreshToken(token) },
      { transaction }
    );
    return token;
  });

  return sessionPayload(traveller, newToken);
}

async function logout(presentedToken) {
  if (!presentedToken) return;
  const tokenHash = hashRefreshToken(presentedToken);
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash, subjectType: 'traveller', revokedAt: null } }
  );
}

async function changePassword(traveller, { currentPassword, newPassword }, context = {}) {
  const withHash = await Traveller.scope('withCredentials').findByPk(traveller.id);

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
      { passwordHash: await Traveller.hashPassword(newPassword) },
      { transaction }
    );
    await RefreshToken.update(
      { revokedAt: new Date() },
      {
        where: { subjectType: 'traveller', travellerId: withHash.id, revokedAt: null },
        transaction,
      }
    );
    return issueRefreshToken(withHash.id, context, transaction);
  });

  return sessionPayload(withHash, refreshToken);
}

async function revokeAllForTraveller(travellerId) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { subjectType: 'traveller', travellerId, revokedAt: null } }
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
  revokeAllForTraveller,
  CONSENT_UNRELATED,
};
