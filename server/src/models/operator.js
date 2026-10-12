'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');

const TYPES = [
  'guide',
  'accommodation',
  'transport',
  'permits',
  'equipment',
  'full_service',
  'other',
];

module.exports = (sequelize, DataTypes) => {
  const Operator = sequelize.define(
    'Operator',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
      destinationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM(...TYPES), allowNull: false, defaultValue: 'full_service' },

      contactName: { type: DataTypes.STRING(160), allowNull: true },
      contactEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
        set(value) {
          this.setDataValue('contactEmail', value ? String(value).trim().toLowerCase() : null);
        },
      },
      contactPhone: { type: DataTypes.STRING(40), allowNull: true },
      whatsapp: { type: DataTypes.STRING(40), allowNull: true },

      typicalResponseDays: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 3,
      },

      vettedAt: { type: DataTypes.DATE, allowNull: true },
      vettedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      vettingNotes: { type: DataTypes.TEXT, allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // --- Self-service portal credentials ---------------------------------
      // Same shape as `Traveller`'s — an operator is not staff and gets no row
      // in `users`, so its credential lives here rather than in a parallel
      // account table.
      passwordHash: { type: DataTypes.STRING(255), allowNull: true },
      portalEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      inviteTokenHash: { type: DataTypes.CHAR(64), allowNull: true },
      inviteExpiresAt: { type: DataTypes.DATE, allowNull: true },
      inviteSentAt: { type: DataTypes.DATE, allowNull: true },
      portalActivatedAt: { type: DataTypes.DATE, allowNull: true },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      failedLoginAttempts: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      lockedUntil: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'operators',
      underscored: true,
      defaultScope: {
        attributes: { exclude: ['passwordHash', 'inviteTokenHash'] },
      },
      scopes: {
        withCredentials: { attributes: { include: ['passwordHash', 'inviteTokenHash'] } },
      },
    }
  );

  Operator.TYPES = TYPES;

  Operator.associate = (models) => {
    Operator.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    });
    Operator.belongsTo(models.User, { foreignKey: 'vettedByUserId', as: 'vettedBy' });
    Operator.hasMany(models.OperatorConfirmation, {
      foreignKey: 'operatorId',
      as: 'confirmations',
    });
    Operator.hasMany(models.RefreshToken, {
      foreignKey: 'operatorId',
      as: 'refreshTokens',
      onDelete: 'CASCADE',
    });
  };

  Operator.prototype.isVetted = function isVetted() {
    return Boolean(this.vettedAt);
  };

  /** Whether this operator can be given new work. */
  Operator.prototype.isUsable = function isUsable() {
    return this.isActive && this.isVetted();
  };

  // --- Portal credentials -----------------------------------------------
  // Identical to `Traveller`'s — see that model for the reasoning.

  Operator.hashPassword = async function hashPassword(plainText) {
    return bcrypt.hash(plainText, env.auth.bcryptSaltRounds);
  };

  Operator.prototype.verifyPassword = async function verifyPassword(plainText) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plainText, this.passwordHash);
  };

  Operator.prototype.isLocked = function isLocked() {
    return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
  };

  Operator.prototype.hasPendingInvite = function hasPendingInvite() {
    return Boolean(
      this.inviteExpiresAt && this.inviteExpiresAt.getTime() > Date.now() && !this.passwordHash
    );
  };

  Operator.prototype.canUsePortal = function canUsePortal() {
    return Boolean(this.isActive && this.portalEnabled && this.passwordHash);
  };

  /** Portal state, for the staff screens — mirrors `Traveller.prototype.portalStatus`. */
  Operator.prototype.portalStatus = function portalStatus() {
    let state = 'not_invited';
    if (this.portalActivatedAt) state = this.portalEnabled ? 'active' : 'suspended';
    else if (this.inviteExpiresAt) {
      state = this.inviteExpiresAt.getTime() > Date.now() ? 'invited' : 'invite_expired';
    }
    return {
      state,
      enabled: this.portalEnabled,
      invitedAt: this.inviteSentAt,
      inviteExpiresAt: this.inviteExpiresAt,
      activatedAt: this.portalActivatedAt,
      lastLoginAt: this.lastLoginAt,
      lockedUntil: this.isLocked() ? this.lockedUntil : null,
    };
  };

  /** The operator's own view of themselves in the portal. */
  Operator.prototype.toSelfJSON = function toSelfJSON() {
    return {
      id: String(this.id),
      name: this.name,
      destinationId: String(this.destinationId),
      destination: this.destination
        ? { id: String(this.destination.id), code: this.destination.code, name: this.destination.name }
        : undefined,
      type: this.type,
      contactName: this.contactName,
      contactEmail: this.contactEmail,
      contactPhone: this.contactPhone,
      whatsapp: this.whatsapp,
    };
  };

  /**
   * @param {object} options
   * @param {object} options.stats  Optional performance figures from the service.
   */
  Operator.prototype.toPublicJSON = function toPublicJSON({ stats } = {}) {
    return {
      id: String(this.id),
      name: this.name,
      destinationId: String(this.destinationId),
      destination: this.destination
        ? {
            id: String(this.destination.id),
            code: this.destination.code,
            name: this.destination.name,
          }
        : undefined,
      type: this.type,

      contactName: this.contactName,
      contactEmail: this.contactEmail,
      contactPhone: this.contactPhone,
      whatsapp: this.whatsapp,

      typicalResponseDays: this.typicalResponseDays,

      isVetted: this.isVetted(),
      isUsable: this.isUsable(),
      vettedAt: this.vettedAt,
      vettedBy: this.vettedBy
        ? { id: String(this.vettedBy.id), fullName: this.vettedBy.fullName() }
        : undefined,
      vettingNotes: this.vettingNotes,

      notes: this.notes,
      isActive: this.isActive,
      portal: this.portalStatus(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,

      stats: stats || undefined,
    };
  };

  return Operator;
};
