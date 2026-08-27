'use strict';

module.exports = (sequelize, DataTypes) => {
  const ItinerarySegment = sequelize.define(
    'ItinerarySegment',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      destinationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
      description: { type: DataTypes.TEXT, allowNull: true },
      startDate: { type: DataTypes.DATEONLY, allowNull: true },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      accommodation: { type: DataTypes.STRING(300), allowNull: true },
      transportNotes: { type: DataTypes.TEXT, allowNull: true },
      maxAltitudeMetres: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'itinerary_segments',
      underscored: true,
      validate: {
        endAfterStart() {
          if (this.startDate && this.endDate && this.endDate < this.startDate) {
            throw new Error('Segment end date cannot be before its start date.');
          }
        },
      },
    }
  );

  ItinerarySegment.associate = (models) => {
    ItinerarySegment.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
    ItinerarySegment.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    });
  };

  ItinerarySegment.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      bookingId: String(this.bookingId),
      destinationId: String(this.destinationId),
      destination: this.destination
        ? {
            id: String(this.destination.id),
            code: this.destination.code,
            name: this.destination.name,
          }
        : undefined,
      sequence: this.sequence,
      title: this.title,
      description: this.description,
      startDate: this.startDate,
      endDate: this.endDate,
      accommodation: this.accommodation,
      transportNotes: this.transportNotes,
      maxAltitudeMetres: this.maxAltitudeMetres,
    };
  };

  return ItinerarySegment;
};
