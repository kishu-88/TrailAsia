'use strict';

const { decimalGetter } = require('../utils/money');

const STATUSES = [
  'enquiry',
  'quoted',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
];

/**
 * Which status can follow which.
 *
 * Encoded here rather than left to whoever is writing the update handler,
 * because "confirmed → enquiry" is the kind of transition that quietly corrupts
 * a pipeline report and nobody notices for a month.
 */
const ALLOWED_TRANSITIONS = {
  enquiry: ['quoted', 'cancelled'],
  quoted: ['confirmed', 'enquiry', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define(
    'Booking',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      title: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'enquiry',
      },
      consultantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      coordinatorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      leadTravellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      departureDate: { type: DataTypes.DATEONLY, allowNull: true },
      returnDate: { type: DataTypes.DATEONLY, allowNull: true },
      partySize: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      currencyCode: {
        type: DataTypes.CHAR(3),
        allowNull: false,
        defaultValue: 'AUD',
        set(value) {
          this.setDataValue('currencyCode', String(value || 'AUD').toUpperCase());
        },
      },
      // Always read back as a fixed two-place string. mysql2 returns DECIMAL as
      // a string and sqlite3 as a number; the getter makes the API contract the
      // same either way, and keeps cents out of floating point.
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        get: decimalGetter('totalAmount'),
      },
      depositAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        get: decimalGetter('depositAmount'),
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      cancelledAt: { type: DataTypes.DATE, allowNull: true },
      cancellationReason: { type: DataTypes.STRING(500), allowNull: true },
      createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'bookings',
      underscored: true,
      validate: {
        returnAfterDeparture() {
          if (this.departureDate && this.returnDate && this.returnDate < this.departureDate) {
            throw new Error('Return date cannot be before the departure date.');
          }
        },
      },
    }
  );

  Booking.STATUSES = STATUSES;
  Booking.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

  Booking.canTransition = function canTransition(from, to) {
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  };

  Booking.associate = (models) => {
    Booking.belongsTo(models.User, { foreignKey: 'consultantId', as: 'consultant' });
    Booking.belongsTo(models.User, { foreignKey: 'coordinatorId', as: 'coordinator' });
    Booking.belongsTo(models.Traveller, {
      foreignKey: 'leadTravellerId',
      as: 'leadTraveller',
    });
    Booking.belongsToMany(models.Traveller, {
      through: models.BookingTraveller,
      foreignKey: 'bookingId',
      otherKey: 'travellerId',
      as: 'travellers',
    });
    Booking.hasMany(models.ItinerarySegment, {
      foreignKey: 'bookingId',
      as: 'segments',
      onDelete: 'CASCADE',
    });
  };

  Booking.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      reference: this.reference,
      title: this.title,
      status: this.status,
      allowedNextStatuses: ALLOWED_TRANSITIONS[this.status] || [],
      consultantId: String(this.consultantId),
      consultant: this.consultant
        ? { id: String(this.consultant.id), fullName: this.consultant.fullName() }
        : undefined,
      coordinatorId: this.coordinatorId ? String(this.coordinatorId) : null,
      coordinator: this.coordinator
        ? { id: String(this.coordinator.id), fullName: this.coordinator.fullName() }
        : undefined,
      leadTravellerId: this.leadTravellerId ? String(this.leadTravellerId) : null,
      departureDate: this.departureDate,
      returnDate: this.returnDate,
      partySize: this.partySize,
      currencyCode: this.currencyCode,
      totalAmount: this.totalAmount,
      depositAmount: this.depositAmount,
      notes: this.notes,
      cancelledAt: this.cancelledAt,
      cancellationReason: this.cancellationReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      travellers: this.travellers
        ? this.travellers.map((t) => ({
            id: String(t.id),
            fullName: t.fullName(),
            isLead: t.BookingTraveller ? t.BookingTraveller.isLead : undefined,
          }))
        : undefined,
      segments: this.segments
        ? this.segments.map((s) => s.toPublicJSON())
        : undefined,
    };
  };

  return Booking;
};
