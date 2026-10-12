'use strict';

const { decimalGetter } = require('../utils/money');
const { parseJsonArray } = require('../utils/json');

module.exports = (sequelize, DataTypes) => {
  const Destination = sequelize.define(
    'Destination',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue('code', String(value || '').trim().toUpperCase());
        },
      },
      name: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
      countryCode: {
        type: DataTypes.CHAR(2),
        allowNull: true,
        set(value) {
          this.setDataValue('countryCode', value ? String(value).toUpperCase() : null);
        },
      },
      region: { type: DataTypes.STRING(60), allowNull: true },
      currencyCode: {
        type: DataTypes.CHAR(3),
        allowNull: false,
        defaultValue: 'AUD',
        set(value) {
          this.setDataValue('currencyCode', String(value || 'AUD').toUpperCase());
        },
      },
      maxAltitudeMetres: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      advisoryNotes: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // --- Marketing content, for the public TrailAsia Book site -----------
      summary: { type: DataTypes.STRING(500), allowNull: true },
      heroImageUrl: { type: DataTypes.STRING(500), allowNull: true },
      // Ordered array of short strings, e.g. ["Sherpa-led guides", "EBC views"].
      // Custom getter: see utils/json.js#parseJsonArray for why this can't
      // just trust the raw column value to already be an array.
      highlights: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonArray(this.getDataValue('highlights'));
        },
      },
      durationDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      priceFromAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        get: decimalGetter('priceFromAmount'),
      },
      priceFromCurrencyCode: {
        type: DataTypes.CHAR(3),
        allowNull: true,
        set(value) {
          this.setDataValue('priceFromCurrencyCode', value ? String(value).toUpperCase() : null);
        },
      },

      // --- Travel-guide content, also for the public site -------------------
      bestTimeToVisit: { type: DataTypes.STRING(200), allowNull: true },
      fitnessLevel: {
        type: DataTypes.ENUM('easy', 'moderate', 'challenging', 'strenuous'),
        allowNull: true,
      },
      // Ordered array of short strings, same pattern as `highlights`.
      whatToPack: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonArray(this.getDataValue('whatToPack'));
        },
      },
      cultureNotes: { type: DataTypes.TEXT, allowNull: true },

      // Named tourist attractions within the country — [{ name, description }] —
      // distinct from `highlights`, which describes the trip itinerary itself.
      attractions: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonArray(this.getDataValue('attractions'));
        },
      },
      // Quick practical facts — [{ label, value }] — e.g. currency, language,
      // time zone, visa, plug type. A flexible list rather than fixed columns
      // so not every destination needs the same facts.
      thingsToKnow: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonArray(this.getDataValue('thingsToKnow'));
        },
      },
    },
    { tableName: 'destinations', underscored: true }
  );

  Destination.associate = (models) => {
    Destination.hasMany(models.DocumentRequirement, {
      foreignKey: 'destinationId',
      as: 'documentRequirements',
      onDelete: 'CASCADE',
    });
    Destination.hasMany(models.ItinerarySegment, {
      foreignKey: 'destinationId',
      as: 'segments',
    });
    Destination.hasMany(models.Testimonial, {
      foreignKey: 'destinationId',
      as: 'testimonials',
      onDelete: 'CASCADE',
    });
  };

  return Destination;
};
