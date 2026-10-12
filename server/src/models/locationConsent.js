'use strict';

/**
 * One traveller's location-sharing decision for one trip.
 *
 * Sharing is off until somebody chooses otherwise. That default is the whole
 * point: a safety feature that turns itself on is surveillance, and a traveller
 * who cannot see that it is off will not trust the one that is on.
 */
module.exports = (sequelize, DataTypes) => {
  const LocationConsent = sequelize.define(
    'LocationConsent',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      status: {
        type: DataTypes.ENUM('granted', 'withdrawn'),
        allowNull: false,
        defaultValue: 'withdrawn',
      },
      grantedAt: { type: DataTypes.DATE, allowNull: true },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true },
      consentStatement: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'location_consents', underscored: true }
  );

  LocationConsent.associate = (models) => {
    LocationConsent.belongsTo(models.Traveller, {
      foreignKey: 'travellerId',
      as: 'traveller',
    });
    LocationConsent.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
  };

  LocationConsent.prototype.isGranted = function isGranted() {
    return this.status === 'granted';
  };

  LocationConsent.prototype.toPublicJSON = function toPublicJSON() {
    return {
      travellerId: String(this.travellerId),
      bookingId: String(this.bookingId),
      status: this.status,
      granted: this.isGranted(),
      grantedAt: this.grantedAt,
      withdrawnAt: this.withdrawnAt,
      consentStatement: this.consentStatement,
    };
  };

  return LocationConsent;
};
