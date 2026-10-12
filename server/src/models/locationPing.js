'use strict';

/** Coordinates come back from MySQL as strings and from SQLite as numbers. */
function coordinate(field) {
  return function get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? null : Number(raw);
  };
}

/**
 * A position reported while location sharing was switched on.
 *
 * Deliberately thin. This table holds no notes, no device identifier and no
 * anything else that would make it interesting to keep — it exists to answer
 * "where was this person last seen" during a trip, and to be deleted afterwards.
 */
module.exports = (sequelize, DataTypes) => {
  const LocationPing = sequelize.define(
    'LocationPing',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      latitude: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: false,
        get: coordinate('latitude'),
        validate: { min: -90, max: 90 },
      },
      longitude: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: false,
        get: coordinate('longitude'),
        validate: { min: -180, max: 180 },
      },
      accuracyMetres: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      altitudeMetres: { type: DataTypes.INTEGER, allowNull: true },
      batteryPercent: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        validate: { min: 0, max: 100 },
      },
      source: {
        type: DataTypes.ENUM('device', 'manual', 'sos'),
        allowNull: false,
        defaultValue: 'device',
      },
      recordedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: 'location_pings', underscored: true }
  );

  LocationPing.associate = (models) => {
    LocationPing.belongsTo(models.Traveller, { foreignKey: 'travellerId', as: 'traveller' });
    LocationPing.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
  };

  LocationPing.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      travellerId: String(this.travellerId),
      bookingId: String(this.bookingId),
      latitude: this.latitude,
      longitude: this.longitude,
      accuracyMetres: this.accuracyMetres,
      altitudeMetres: this.altitudeMetres,
      batteryPercent: this.batteryPercent,
      source: this.source,
      recordedAt: this.recordedAt,
    };
  };

  return LocationPing;
};
