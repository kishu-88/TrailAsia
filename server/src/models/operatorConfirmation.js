'use strict';

const { decimalGetter } = require('../utils/money');

const STATUSES = ['pending', 'requested', 'confirmed', 'declined', 'cancelled'];
const OPEN_STATUSES = ['pending', 'requested'];
const SERVICE_TYPES = [
  'guide',
  'accommodation',
  'transport',
  'permits',
  'equipment',
  'other',
];

/**
 * Which status can follow which.
 *
 * `confirmed → declined` is allowed on purpose: operators do withdraw, and the
 * system has to be able to record that a confirmed arrangement fell through.
 * The reverse — `declined → confirmed` — is not, because an operator changing
 * their mind is a new request, and collapsing the two loses the fact that they
 * said no first. That history is the point: an operator who declines late,
 * repeatedly, is one the agency should know about.
 */
const ALLOWED_TRANSITIONS = {
  pending: ['requested', 'cancelled'],
  requested: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['declined', 'cancelled'],
  declined: ['cancelled'],
  cancelled: [],
};

module.exports = (sequelize, DataTypes) => {
  const OperatorConfirmation = sequelize.define(
    'OperatorConfirmation',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      operatorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      itinerarySegmentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

      serviceType: {
        type: DataTypes.ENUM(...SERVICE_TYPES),
        allowNull: false,
        defaultValue: 'other',
      },
      summary: {
        type: DataTypes.STRING(300),
        allowNull: false,
        validate: { notEmpty: true },
      },
      details: { type: DataTypes.TEXT, allowNull: true },

      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'pending',
      },
      operatorReference: { type: DataTypes.STRING(120), allowNull: true },

      dueBy: { type: DataTypes.DATEONLY, allowNull: true },
      requestedAt: { type: DataTypes.DATE, allowNull: true },
      respondedAt: { type: DataTypes.DATE, allowNull: true },

      currencyCode: {
        type: DataTypes.CHAR(3),
        allowNull: false,
        defaultValue: 'AUD',
        set(value) {
          this.setDataValue('currencyCode', String(value || 'AUD').toUpperCase());
        },
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        get: decimalGetter('amount'),
      },

      declineReason: { type: DataTypes.STRING(500), allowNull: true },

      createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    { tableName: 'operator_confirmations', underscored: true }
  );

  OperatorConfirmation.STATUSES = STATUSES;
  OperatorConfirmation.OPEN_STATUSES = OPEN_STATUSES;
  OperatorConfirmation.SERVICE_TYPES = SERVICE_TYPES;
  OperatorConfirmation.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

  OperatorConfirmation.canTransition = function canTransition(from, to) {
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  };

  OperatorConfirmation.associate = (models) => {
    OperatorConfirmation.belongsTo(models.Booking, {
      foreignKey: 'bookingId',
      as: 'booking',
    });
    OperatorConfirmation.belongsTo(models.Operator, {
      foreignKey: 'operatorId',
      as: 'operator',
    });
    OperatorConfirmation.belongsTo(models.ItinerarySegment, {
      foreignKey: 'itinerarySegmentId',
      as: 'segment',
    });
    OperatorConfirmation.belongsTo(models.User, {
      foreignKey: 'createdByUserId',
      as: 'createdBy',
    });
    OperatorConfirmation.hasMany(models.TravellerDocument, {
      foreignKey: 'operatorConfirmationId',
      as: 'documents',
    });
  };

  /** Still waiting on an answer. */
  OperatorConfirmation.prototype.isOpen = function isOpen() {
    return OPEN_STATUSES.includes(this.status);
  };

  /**
   * Days until an answer is needed — negative once it is late.
   *
   * Computed here, like Task.daysUntilDue, so the booking panel, the chase list
   * and the readiness summary cannot disagree about what "overdue" means today.
   */
  OperatorConfirmation.prototype.daysUntilDue = function daysUntilDue(today = new Date()) {
    if (!this.dueBy) return null;
    const due = new Date(`${this.dueBy}T00:00:00Z`);
    const now = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  };

  OperatorConfirmation.prototype.isOverdue = function isOverdue(today = new Date()) {
    if (!this.isOpen()) return false;
    const days = this.daysUntilDue(today);
    return days !== null && days < 0;
  };

  /** How long the operator took to answer, in days. Null while still open. */
  OperatorConfirmation.prototype.responseDays = function responseDays() {
    if (!this.requestedAt || !this.respondedAt) return null;
    const ms = new Date(this.respondedAt).getTime() - new Date(this.requestedAt).getTime();
    return Math.max(Math.round(ms / 86400000), 0);
  };

  OperatorConfirmation.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      bookingId: String(this.bookingId),
      booking: this.booking
        ? {
            id: String(this.booking.id),
            reference: this.booking.reference,
            title: this.booking.title,
            status: this.booking.status,
            departureDate: this.booking.departureDate,
          }
        : undefined,

      operatorId: String(this.operatorId),
      operator: this.operator
        ? {
            id: String(this.operator.id),
            name: this.operator.name,
            type: this.operator.type,
            contactEmail: this.operator.contactEmail,
            contactPhone: this.operator.contactPhone,
            whatsapp: this.operator.whatsapp,
            isVetted: this.operator.isVetted(),
          }
        : undefined,

      itinerarySegmentId: this.itinerarySegmentId ? String(this.itinerarySegmentId) : null,
      segment: this.segment
        ? {
            id: String(this.segment.id),
            title: this.segment.title,
            sequence: this.segment.sequence,
          }
        : undefined,

      serviceType: this.serviceType,
      summary: this.summary,
      details: this.details,

      status: this.status,
      allowedNextStatuses: ALLOWED_TRANSITIONS[this.status] || [],
      isOpen: this.isOpen(),
      operatorReference: this.operatorReference,

      dueBy: this.dueBy,
      daysUntilDue: this.daysUntilDue(),
      overdue: this.isOverdue(),
      requestedAt: this.requestedAt,
      respondedAt: this.respondedAt,
      responseDays: this.responseDays(),

      currencyCode: this.currencyCode,
      amount: this.amount,
      declineReason: this.declineReason,

      // Documents obtained because of this arrangement — a permit, mainly.
      // Only present when the caller eager-loaded it; a list view has no
      // reason to pull every linked document for every row.
      documents: this.documents ? this.documents.map((doc) => doc.toPublicJSON()) : undefined,

      createdBy: this.createdBy
        ? { id: String(this.createdBy.id), fullName: this.createdBy.fullName() }
        : undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  return OperatorConfirmation;
};
