'use strict';

module.exports = (sequelize, DataTypes) => {
  const Testimonial = sequelize.define(
    'Testimonial',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      destinationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      authorName: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
      tripReference: { type: DataTypes.STRING(20), allowNull: true },
      quote: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true, validate: { min: 1, max: 5 } },
      isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'testimonials', underscored: true }
  );

  Testimonial.associate = (models) => {
    Testimonial.belongsTo(models.Destination, { foreignKey: 'destinationId', as: 'destination' });
  };

  Testimonial.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      destinationId: this.destinationId ? String(this.destinationId) : null,
      destination:
        this.destination !== undefined && this.destination !== null
          ? { id: String(this.destination.id), code: this.destination.code, name: this.destination.name }
          : undefined,
      authorName: this.authorName,
      tripReference: this.tripReference,
      quote: this.quote,
      rating: this.rating,
    };
  };

  return Testimonial;
};
