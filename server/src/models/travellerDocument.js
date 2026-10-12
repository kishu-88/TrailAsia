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
      // Set when this document exists because of a specific arrangement with
      // a ground operator — a permit is the clearest case. Most documents
      // (a passport, a personal insurance policy) leave this null.
      operatorConfirmationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
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
      // An external reference or link — set when there's no uploaded file at
      // all (or in addition to one). See `storedFileName` below for the file
      // this codebase actually holds.
      filePath: { type: DataTypes.STRING(500), allowNull: true },

      // --- An uploaded file, via fileStorage.service.js ---------------------
      // `storedFileName` is the only one of these retrieval depends on — a
      // random name under the uploads root, never derived from anything a
      // traveller typed. The rest is display metadata.
      storedFileName: { type: DataTypes.STRING(300), allowNull: true },
      originalFileName: { type: DataTypes.STRING(255), allowNull: true },
      fileMimeType: { type: DataTypes.STRING(100), allowNull: true },
      fileSizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
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
    TravellerDocument.belongsTo(models.OperatorConfirmation, {
      foreignKey: 'operatorConfirmationId',
      as: 'operatorConfirmation',
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

  TravellerDocument.prototype.hasUploadedFile = function hasUploadedFile() {
    return Boolean(this.storedFileName);
  };

  TravellerDocument.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      travellerId: String(this.travellerId),
      destinationId: this.destinationId ? String(this.destinationId) : null,
      destination: this.destination
        ? { id: String(this.destination.id), code: this.destination.code, name: this.destination.name }
        : undefined,
      operatorConfirmationId: this.operatorConfirmationId
        ? String(this.operatorConfirmationId)
        : null,
      operatorConfirmation: this.operatorConfirmation
        ? {
            id: String(this.operatorConfirmation.id),
            summary: this.operatorConfirmation.summary,
            status: this.operatorConfirmation.status,
          }
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
      // An external reference/link, if that's what this document has instead
      // of (or alongside) an uploaded file.
      filePath: this.filePath,
      // Never `storedFileName` — that's an internal disk path. Downloading
      // an uploaded file goes through `/documents/:id/file`, gated by
      // ownership or role, not by knowing a filename.
      hasFile: this.hasUploadedFile(),
      fileName: this.originalFileName,
      fileMimeType: this.fileMimeType,
      fileSizeBytes: this.fileSizeBytes,
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
