'use strict';

const { decimalGetter, rateGetter } = require('../utils/money');

const DIRECTIONS = ['incoming', 'outgoing'];
const METHODS = ['bank_transfer', 'card', 'cash', 'cheque', 'agent_credit', 'other'];
const STATUSES = ['pending', 'cleared', 'failed', 'refunded'];

/**
 * Which status can follow which.
 *
 * A cleared payment can be refunded, and a pending one can fail or clear. What
 * is not here is the route back: `failed → cleared` and `refunded → cleared` are
 * both absent, because a payment that bounced and was later resent is a second
 * movement of money, not the first one changing its mind. Collapsing them would
 * lose the bounce, which is the fact finance actually needs.
 */
const ALLOWED_TRANSITIONS = {
  pending: ['cleared', 'failed'],
  cleared: ['refunded', 'failed'],
  failed: [],
  refunded: [],
};

/** Only cleared money counts towards a balance. */
const COUNTED_STATUSES = ['cleared'];

module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      paymentScheduleId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      operatorConfirmationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

      direction: {
        type: DataTypes.ENUM(...DIRECTIONS),
        allowNull: false,
        defaultValue: 'incoming',
      },
      method: {
        type: DataTypes.ENUM(...METHODS),
        allowNull: false,
        defaultValue: 'bank_transfer',
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'pending',
      },

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

      baseCurrencyCode: {
        type: DataTypes.CHAR(3),
        allowNull: false,
        defaultValue: 'AUD',
        set(value) {
          this.setDataValue('baseCurrencyCode', String(value || 'AUD').toUpperCase());
        },
      },
      // Read back at eight places, the precision it was stored with. Rounding it
      // to two for display would make NPR→AUD look like 0.01.
      exchangeRate: {
        type: DataTypes.DECIMAL(16, 8),
        allowNull: false,
        defaultValue: 1,
        get: rateGetter('exchangeRate'),
      },
      amountInBase: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        get: decimalGetter('amountInBase'),
      },

      // Bank transfer or gateway reference. Never card data — see the migration.
      reference: { type: DataTypes.STRING(120), allowNull: true },

      receivedOn: { type: DataTypes.DATEONLY, allowNull: false },
      clearedAt: { type: DataTypes.DATE, allowNull: true },
      settledReason: { type: DataTypes.STRING(500), allowNull: true },

      notes: { type: DataTypes.TEXT, allowNull: true },

      recordedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    { tableName: 'payments', underscored: true }
  );

  Payment.DIRECTIONS = DIRECTIONS;
  Payment.METHODS = METHODS;
  Payment.STATUSES = STATUSES;
  Payment.COUNTED_STATUSES = COUNTED_STATUSES;
  Payment.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

  Payment.canTransition = function canTransition(from, to) {
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  };

  Payment.associate = (models) => {
    Payment.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
    Payment.belongsTo(models.PaymentSchedule, {
      foreignKey: 'paymentScheduleId',
      as: 'schedule',
    });
    Payment.belongsTo(models.OperatorConfirmation, {
      foreignKey: 'operatorConfirmationId',
      as: 'operatorConfirmation',
    });
    Payment.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  /** Counts towards the balance. Pending money is money we have been promised. */
  Payment.prototype.counts = function counts() {
    return COUNTED_STATUSES.includes(this.status);
  };

  /** Whether this payment was converted from another currency. */
  Payment.prototype.isConverted = function isConverted() {
    return this.currencyCode !== this.baseCurrencyCode;
  };

  Payment.prototype.toPublicJSON = function toPublicJSON() {
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

      paymentScheduleId: this.paymentScheduleId ? String(this.paymentScheduleId) : null,
      schedule: this.schedule
        ? {
            id: String(this.schedule.id),
            label: this.schedule.label,
            dueOn: this.schedule.dueOn,
            amount: this.schedule.amount,
          }
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

      direction: this.direction,
      method: this.method,
      status: this.status,
      allowedNextStatuses: ALLOWED_TRANSITIONS[this.status] || [],
      counts: this.counts(),

      currencyCode: this.currencyCode,
      amount: this.amount,

      baseCurrencyCode: this.baseCurrencyCode,
      exchangeRate: this.exchangeRate,
      amountInBase: this.amountInBase,
      isConverted: this.isConverted(),

      reference: this.reference,
      receivedOn: this.receivedOn,
      clearedAt: this.clearedAt,
      settledReason: this.settledReason,
      notes: this.notes,

      recordedBy: this.recordedBy
        ? { id: String(this.recordedBy.id), fullName: this.recordedBy.fullName() }
        : undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  return Payment;
};
