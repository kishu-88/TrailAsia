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

const STATUSES = ['outstanding', 'submitted', 'verified', 'rejected'];

module.exports = (sequelize, DataTypes) => {
  const TravellerDocument = sequelize.define(
    'TravellerDocument',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      destinationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      type: { type: DataTypes.ENUM(...DOCUMENT_TYPES), allowNull: false },
      reference: { type: DataTypes.STRING(120), allowNull: true },
      issuer: { type: DataTypes.STRING(160), allowNull: true },
      issuedOn: { type: DataTypes.DATEONLY, allowNull: true },
      expiresOn: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'outstanding',
      },
      altitudeCoverMetres: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      insurerContactPhone: { type: DataTypes.STRING(40), allowNull: true },
      verifiedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      filePath: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'traveller_documents', underscored: true }
  );

  TravellerDocument.DOCUMENT_TYPES = DOCUMENT_TYPES;
  TravellerDocument.STATUSES = STATUSES;

  TravellerDocument.associate = (models) => {
    TravellerDocument.belongsTo(models.Traveller, {
      foreignKey: 'travellerId',
      as: 'traveller',
    });
    TravellerDocument.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    });
    TravellerDocument.belongsTo(models.User, {
      foreignKey: 'verifiedByUserId',
      as: 'verifiedBy',
    });
  };

  /** Expired documents count as outstanding no matter what the stored status says. */
  TravellerDocument.prototype.isExpired = function isExpired(asOf = new Date()) {
    if (!this.expiresOn) return false;
    return new Date(this.expiresOn) < new Date(asOf.toISOString().slice(0, 10));
  };

  TravellerDocument.prototype.effectiveStatus = function effectiveStatus(asOf) {
    return this.isExpired(asOf) ? 'expired' : this.status;
  };

  TravellerDocument.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      travellerId: String(this.travellerId),
      destinationId: this.destinationId ? String(this.destinationId) : null,
      destination: this.destination
        ? { id: String(this.destination.id), code: this.destination.code, name: this.destination.name }
        : undefined,
      type: this.type,
      reference: this.reference,
      issuer: this.issuer,
      issuedOn: this.issuedOn,
      expiresOn: this.expiresOn,
      status: this.status,
      effectiveStatus: this.effectiveStatus(),
      isExpired: this.isExpired(),
      altitudeCoverMetres: this.altitudeCoverMetres,
      insurerContactPhone: this.insurerContactPhone,
      verifiedAt: this.verifiedAt,
      verifiedBy: this.verifiedBy
        ? { id: String(this.verifiedBy.id), fullName: this.verifiedBy.fullName() }
        : undefined,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  return TravellerDocument;
};
