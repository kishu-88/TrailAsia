'use strict';

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
  };

  return Destination;
};
