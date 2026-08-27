'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');

/**
 * Staff account.
 *
 * Accounts are created by an administrator — there is no public sign-up. A
 * 25-person agency does not need open registration, and every account that can
 * see passport or health data should be deliberately provisioned.
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      firstName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: true },
      },
      lastName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: true },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
        set(value) {
          // Store lowercase so lookups are predictable regardless of how it was typed.
          this.setDataValue('email', String(value || '').trim().toLowerCase());
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('consultant', 'coordinator', 'finance', 'admin'),
        allowNull: false,
        defaultValue: 'consultant',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      failedLoginAttempts: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'users',
      underscored: true,
      defaultScope: {
        // Never leak the hash by accident — ask for it explicitly when verifying.
        attributes: { exclude: ['passwordHash'] },
      },
      scopes: {
        withPassword: { attributes: { include: ['passwordHash'] } },
      },
    }
  );

  User.associate = (models) => {
    User.hasMany(models.RefreshToken, {
      foreignKey: 'userId',
      as: 'refreshTokens',
      onDelete: 'CASCADE',
    });
  };

  /** Hash a plaintext password using the configured cost factor. */
  User.hashPassword = async function hashPassword(plainText) {
    return bcrypt.hash(plainText, env.auth.bcryptSaltRounds);
  };

  /** Compare a candidate password against this user's stored hash. */
  User.prototype.verifyPassword = async function verifyPassword(plainText) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plainText, this.passwordHash);
  };

  /** True while a lockout from repeated failed logins is still in force. */
  User.prototype.isLocked = function isLocked() {
    return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
  };

  User.prototype.fullName = function fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  };

  /** The shape sent to the client. Nothing sensitive belongs in here. */
  User.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName(),
      email: this.email,
      role: this.role,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
    };
  };

  return User;
};
