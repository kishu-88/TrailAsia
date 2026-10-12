'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');

/**
 * Masks all but the last three characters of a passport number.
 *
 * Consultants need enough to confirm they are looking at the right record;
 * almost none of them need the full number, and it should not be sitting in
 * every list response, browser cache and screenshot. The full value is returned
 * only from the single-record endpoint, and only to roles that need it.
 */
function maskPassport(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 3) return '•'.repeat(text.length);
  return `${'•'.repeat(Math.max(text.length - 3, 3))}${text.slice(-3)}`;
}

module.exports = (sequelize, DataTypes) => {
  const Traveller = sequelize.define(
    'Traveller',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      firstName: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
      lastName: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
        set(value) {
          this.setDataValue('email', value ? String(value).trim().toLowerCase() : null);
        },
      },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
      nationality: { type: DataTypes.CHAR(2), allowNull: true },

      passportNumber: { type: DataTypes.STRING(60), allowNull: true },
      passportCountry: { type: DataTypes.CHAR(2), allowNull: true },
      passportExpiry: { type: DataTypes.DATEONLY, allowNull: true },

      emergencyContactName: { type: DataTypes.STRING(160), allowNull: true },
      emergencyContactPhone: { type: DataTypes.STRING(40), allowNull: true },
      emergencyContactRelationship: { type: DataTypes.STRING(60), allowNull: true },

      dietaryNotes: { type: DataTypes.TEXT, allowNull: true },
      medicalNotes: { type: DataTypes.TEXT, allowNull: true },

      createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // --- Self-service portal credentials ---------------------------------
      // A traveller is not staff and gets no row in `users`. Their credential
      // lives here so a person exists in exactly one place.
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
      tableName: 'travellers',
      underscored: true,
      defaultScope: {
        // Same rule as staff accounts: the hash is fetched deliberately or not
        // at all. The invite hash is just as sensitive — it is a way in.
        attributes: { exclude: ['passwordHash', 'inviteTokenHash'] },
      },
      scopes: {
        withCredentials: { attributes: { include: ['passwordHash', 'inviteTokenHash'] } },
      },
    }
  );

  Traveller.associate = (models) => {
    Traveller.hasMany(models.TravellerDocument, {
      foreignKey: 'travellerId',
      as: 'documents',
      onDelete: 'CASCADE',
    });
    Traveller.belongsToMany(models.Booking, {
      through: models.BookingTraveller,
      foreignKey: 'travellerId',
      otherKey: 'bookingId',
      as: 'bookings',
    });
    Traveller.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    Traveller.hasMany(models.RefreshToken, {
      foreignKey: 'travellerId',
      as: 'refreshTokens',
      onDelete: 'CASCADE',
    });
  };

  Traveller.prototype.fullName = function fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  };

  // --- Portal credentials ---------------------------------------------------

  Traveller.hashPassword = async function hashPassword(plainText) {
    return bcrypt.hash(plainText, env.auth.bcryptSaltRounds);
  };

  Traveller.prototype.verifyPassword = async function verifyPassword(plainText) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plainText, this.passwordHash);
  };

  /** True while a lockout from repeated failed sign-ins is still in force. */
  Traveller.prototype.isLocked = function isLocked() {
    return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
  };

  /** True when an unused invitation is still within its window. */
  Traveller.prototype.hasPendingInvite = function hasPendingInvite() {
    return Boolean(
      this.inviteExpiresAt && this.inviteExpiresAt.getTime() > Date.now() && !this.passwordHash
    );
  };

  /** Can this traveller sign in right now? */
  Traveller.prototype.canUsePortal = function canUsePortal() {
    return Boolean(this.isActive && this.portalEnabled && this.passwordHash);
  };

  /**
   * Portal state, for the staff screens. Says what a consultant needs in order
   * to answer "why can't my traveller log in" without reading the database.
   */
  Traveller.prototype.portalStatus = function portalStatus() {
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

  /**
   * The traveller's own view of themselves in the portal.
   *
   * Their passport number is unmasked here and nowhere else: it is their own
   * document, and a traveller filling in a visa form is exactly who the masking
   * was never meant to obstruct. Staff-only fields — internal notes, who
   * created the record — are not included.
   */
  Traveller.prototype.toSelfJSON = function toSelfJSON() {
    return {
      id: String(this.id),
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName(),
      email: this.email,
      phone: this.phone,
      dateOfBirth: this.dateOfBirth,
      nationality: this.nationality,
      passportNumber: this.passportNumber,
      passportMasked: false,
      passportCountry: this.passportCountry,
      passportExpiry: this.passportExpiry,
      emergencyContact: this.emergencyContactName
        ? {
            name: this.emergencyContactName,
            phone: this.emergencyContactPhone,
            relationship: this.emergencyContactRelationship,
          }
        : null,
      dietaryNotes: this.dietaryNotes,
      medicalNotes: this.medicalNotes,
      documents: this.documents ? this.documents.map((doc) => doc.toPublicJSON()) : undefined,
    };
  };

  /**
   * @param {object} options
   * @param {boolean} options.includePassport  Return the unmasked passport number.
   *   Only the single-record endpoint sets this, and only for roles allowed to see it.
   */
  Traveller.prototype.toPublicJSON = function toPublicJSON({ includePassport = false } = {}) {
    return {
      id: String(this.id),
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName(),
      email: this.email,
      phone: this.phone,
      dateOfBirth: this.dateOfBirth,
      nationality: this.nationality,
      passportNumber: includePassport
        ? this.passportNumber
        : maskPassport(this.passportNumber),
      passportMasked: !includePassport,
      passportCountry: this.passportCountry,
      passportExpiry: this.passportExpiry,
      emergencyContact: this.emergencyContactName
        ? {
            name: this.emergencyContactName,
            phone: this.emergencyContactPhone,
            relationship: this.emergencyContactRelationship,
          }
        : null,
      dietaryNotes: this.dietaryNotes,
      medicalNotes: this.medicalNotes,
      isActive: this.isActive,
      portal: this.portalStatus(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      documents: this.documents
        ? this.documents.map((doc) => doc.toPublicJSON())
        : undefined,
    };
  };

  Traveller.maskPassport = maskPassport;

  return Traveller;
};
