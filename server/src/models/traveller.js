'use strict';

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
    },
    { tableName: 'travellers', underscored: true }
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
  };

  Traveller.prototype.fullName = function fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
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
