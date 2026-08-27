'use strict';

const { Op } = require('sequelize');

const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const authService = require('./auth.service');

const SORTABLE = ['createdAt', 'lastName', 'email', 'role', 'lastLoginAt'];

async function list(query) {
  const options = parseListQuery(query, { sortable: SORTABLE });
  const where = {};

  if (query.role) where.role = query.role;
  if (query.isActive !== undefined && query.isActive !== '') {
    where.isActive = ['1', 'true', 'yes'].includes(String(query.isActive).toLowerCase());
  }
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [
      { firstName: { [Op.like]: term } },
      { lastName: { [Op.like]: term } },
      { email: { [Op.like]: term } },
    ];
  }

  const result = await User.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (user) => user.toPublicJSON());
}

async function getById(id) {
  const user = await User.findByPk(id);
  if (!user) throw ApiError.notFound('User not found.');
  return user;
}

async function create({ firstName, lastName, email, password, role }) {
  const existing = await User.findOne({ where: { email: String(email).toLowerCase() } });
  if (existing) {
    throw ApiError.badRequest('An account with that email already exists.', {
      code: 'EMAIL_IN_USE',
      details: { email: 'Already in use.' },
    });
  }

  return User.create({
    firstName,
    lastName,
    email,
    role,
    passwordHash: await User.hashPassword(password),
  });
}

async function update(id, changes, actingUser) {
  const user = await getById(id);

  if (changes.email && changes.email.toLowerCase() !== user.email) {
    const clash = await User.findOne({ where: { email: changes.email.toLowerCase() } });
    if (clash) {
      throw ApiError.badRequest('An account with that email already exists.', {
        code: 'EMAIL_IN_USE',
        details: { email: 'Already in use.' },
      });
    }
  }

  // Losing the last administrator would lock everyone out of account management.
  if (changes.role && changes.role !== 'admin' && user.role === 'admin') {
    await assertNotLastActiveAdmin(user.id, 'change the role of');
  }

  // An administrator demoting or deactivating themselves by accident is an easy
  // mistake with an expensive recovery.
  if (String(actingUser.id) === String(user.id) && changes.role && changes.role !== user.role) {
    throw ApiError.badRequest('You cannot change your own role.', {
      code: 'CANNOT_CHANGE_OWN_ROLE',
    });
  }

  await user.update(changes);
  return user;
}

/**
 * Accounts are deactivated, never deleted. Bookings, verified documents and the
 * audit trail all reference the user, and a hard delete would either break those
 * references or quietly rewrite history.
 */
async function deactivate(id, actingUser) {
  const user = await getById(id);

  if (String(actingUser.id) === String(user.id)) {
    throw ApiError.badRequest('You cannot deactivate your own account.', {
      code: 'CANNOT_DEACTIVATE_SELF',
    });
  }
  if (user.role === 'admin') await assertNotLastActiveAdmin(user.id, 'deactivate');

  if (user.isActive) {
    await user.update({ isActive: false });
    // Kill their sessions immediately rather than waiting for token expiry.
    await authService.revokeAllForUser(user.id);
  }
  return user;
}

async function reactivate(id) {
  const user = await getById(id);
  if (!user.isActive) {
    await user.update({ isActive: true, failedLoginAttempts: 0, lockedUntil: null });
  }
  return user;
}

/** Administrator resets someone's password and ends their existing sessions. */
async function resetPassword(id, newPassword) {
  const user = await getById(id);
  await user.update({
    passwordHash: await User.hashPassword(newPassword),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });
  await authService.revokeAllForUser(user.id);
  return user;
}

/** Clear a lockout early, when someone rings the office rather than waiting. */
async function unlock(id) {
  const user = await getById(id);
  await user.update({ failedLoginAttempts: 0, lockedUntil: null });
  return user;
}

async function assertNotLastActiveAdmin(userId, action) {
  const otherAdmins = await User.count({
    where: { role: 'admin', isActive: true, id: { [Op.ne]: userId } },
  });
  if (otherAdmins === 0) {
    throw ApiError.badRequest(
      `Cannot ${action} the only active administrator. Promote another account first.`,
      { code: 'LAST_ADMIN' }
    );
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  deactivate,
  reactivate,
  resetPassword,
  unlock,
};
