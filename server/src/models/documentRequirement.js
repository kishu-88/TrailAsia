'use strict';

const DOCUMENT_TYPES = [
  'passport',
  'visa',
  'insurance',
  'health_declaration',
  'permit',
  'vaccination',
  'other',
];

module.exports = (sequelize, DataTypes) => {
  const DocumentRequirement = sequelize.define(
    'DocumentRequirement',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      destinationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM(...DOCUMENT_TYPES), allowNull: false },
      name: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
      description: { type: DataTypes.TEXT, allowNull: true },
      isMandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      leadTimeDays: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 14,
      },
      minValidityMonths: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      requiresAltitudeCover: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'document_requirements', underscored: true }
  );

  DocumentRequirement.DOCUMENT_TYPES = DOCUMENT_TYPES;

  DocumentRequirement.associate = (models) => {
    DocumentRequirement.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    });
  };

  return DocumentRequirement;
};
