'use strict';

const { decimalGetter } = require('../utils/money');

const STATUSES = ['scheduled', 'waived', 'cancelled'];

/**
 * One planned instalment on a booking.
 *
 * Deliberately has no notion of how much has been paid. That question is
 * answered by reading the ledger, in `payment.service.js`, every time it is
 * asked — so the plan and the money cannot drift apart. See the migration for
 * the reasoning.
 */
module.exports = (sequelize, DataTypes) => {
  const PaymentSchedule = sequelize.define(
    'PaymentSchedule',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },

      label: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notEmpty: true },
      },
      sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

      dueOn: { type: DataTypes.DATEONLY, allowNull: false },

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
        allowNull: false,
        get: decimalGetter('amount'),
      },

      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'scheduled',
      },
      waivedReason: { type: DataTypes.STRING(500), allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },

      createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    { tableName: 'payment_schedules', underscored: true }
  );

  PaymentSchedule.STATUSES = STATUSES;

  PaymentSchedule.associate = (models) => {
    PaymentSchedule.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
    PaymentSchedule.hasMany(models.Payment, {
      foreignKey: 'paymentScheduleId',
      as: 'payments',
    });
    PaymentSchedule.belongsTo(models.User, {
      foreignKey: 'createdByUserId',
      as: 'createdBy',
    });
  };

  /** Still expected to be paid. A waived or cancelled row is owed by nobody. */
  PaymentSchedule.prototype.isLive = function isLive() {
    return this.status === 'scheduled';
  };

  /** Days until it falls due — negative once it is late. */
  PaymentSchedule.prototype.daysUntilDue = function daysUntilDue(today = new Date()) {
    if (!this.dueOn) return null;
    const due = new Date(`${this.dueOn}T00:00:00Z`);
    const now = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  };

  /**
   * Whether the instalment is past its date.
   *
   * Note this is only half of "overdue" — an instalment can be past its date and
   * fully paid. The service pairs this with what the ledger says before calling
   * anything overdue, because a screen that chases a traveller who has already
   * paid does more damage than one that chases nobody.
   */
  PaymentSchedule.prototype.isPastDue = function isPastDue(today = new Date()) {
    if (!this.isLive()) return false;
    const days = this.daysUntilDue(today);
    return days !== null && days < 0;
  };

  /**
   * @param {object} [settlement] What the ledger says about this instalment,
   *   supplied by the service. Absent when the caller only wants the plan.
   */
  PaymentSchedule.prototype.toPublicJSON = function toPublicJSON(settlement) {
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

      label: this.label,
      sequence: this.sequence,
      dueOn: this.dueOn,
      daysUntilDue: this.daysUntilDue(),
      pastDue: this.isPastDue(),

      currencyCode: this.currencyCode,
      amount: this.amount,

      status: this.status,
      isLive: this.isLive(),
      waivedReason: this.waivedReason,
      notes: this.notes,

      // Present only when the service has read the ledger for this row.
      ...(settlement || {}),

      createdBy: this.createdBy
        ? { id: String(this.createdBy.id), fullName: this.createdBy.fullName() }
        : undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  return PaymentSchedule;
};
