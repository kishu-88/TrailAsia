'use strict';

const OPEN_STATUSES = ['raised', 'acknowledged'];

function coordinate(field) {
  return function get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? null : Number(raw);
  };
}

/**
 * An SOS raised from the traveller app.
 *
 * Two things are deliberate in the state machine below.
 *
 * First, `resolved` requires a human. There is no automatic timeout that closes
 * an alert nobody answered — an alert that closes itself is exactly the failure
 * the after-hours gap already produces, dressed up as a feature.
 *
 * Second, a traveller can cancel their own alert but cannot resolve it, and
 * staff can resolve but cannot cancel. "I pressed it by mistake" and "we dealt
 * with it" are different claims and should be made by the person who can
 * actually make them.
 */
module.exports = (sequelize, DataTypes) => {
  const SosAlert = sequelize.define(
    'SosAlert',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      status: {
        type: DataTypes.ENUM('raised', 'acknowledged', 'resolved', 'cancelled'),
        allowNull: false,
        defaultValue: 'raised',
      },
      raisedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      latitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true, get: coordinate('latitude') },
      longitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true, get: coordinate('longitude') },
      accuracyMetres: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      message: { type: DataTypes.STRING(500), allowNull: true },

      acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
      acknowledgedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolvedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      resolutionNotes: { type: DataTypes.TEXT, allowNull: true },
      cancelledAt: { type: DataTypes.DATE, allowNull: true },

      // Who this alert has been handed to — independent of acknowledging it
      // personally. Set and cleared together; see `assignSos` in
      // safety.service.js.
      assignedToUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      assignedAt: { type: DataTypes.DATE, allowNull: true },
      assignedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    { tableName: 'sos_alerts', underscored: true }
  );

  SosAlert.OPEN_STATUSES = OPEN_STATUSES;

  SosAlert.associate = (models) => {
    SosAlert.belongsTo(models.Traveller, { foreignKey: 'travellerId', as: 'traveller' });
    SosAlert.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
    SosAlert.belongsTo(models.User, {
      foreignKey: 'acknowledgedByUserId',
      as: 'acknowledgedBy',
    });
    SosAlert.belongsTo(models.User, { foreignKey: 'resolvedByUserId', as: 'resolvedBy' });
    SosAlert.belongsTo(models.User, { foreignKey: 'assignedToUserId', as: 'assignedTo' });
    SosAlert.belongsTo(models.User, { foreignKey: 'assignedByUserId', as: 'assignedBy' });
  };

  SosAlert.prototype.isOpen = function isOpen() {
    return OPEN_STATUSES.includes(this.status);
  };

  /** Minutes since the alert was raised — the number that matters on a wallboard. */
  SosAlert.prototype.minutesOpen = function minutesOpen() {
    const end = this.resolvedAt || this.cancelledAt || new Date();
    return Math.max(0, Math.round((end.getTime() - this.raisedAt.getTime()) / 60000));
  };

  /**
   * Nobody has claimed this yet — the condition the escalation sweep acts on.
   * Deliberately only "raised and unassigned", not "acknowledged but stalled":
   * once a person is attached to the alert, one way or another, the normal
   * acknowledge/resolve flow is the mechanism, not a repeating page.
   */
  SosAlert.prototype.isUnclaimed = function isUnclaimed() {
    return this.status === 'raised' && !this.assignedToUserId;
  };

  SosAlert.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      travellerId: String(this.travellerId),
      bookingId: String(this.bookingId),
      status: this.status,
      isOpen: this.isOpen(),
      raisedAt: this.raisedAt,
      minutesOpen: this.minutesOpen(),
      latitude: this.latitude,
      longitude: this.longitude,
      accuracyMetres: this.accuracyMetres,
      message: this.message,
      acknowledgedAt: this.acknowledgedAt,
      acknowledgedBy: this.acknowledgedBy
        ? { id: String(this.acknowledgedBy.id), fullName: this.acknowledgedBy.fullName() }
        : undefined,
      resolvedAt: this.resolvedAt,
      resolvedBy: this.resolvedBy
        ? { id: String(this.resolvedBy.id), fullName: this.resolvedBy.fullName() }
        : undefined,
      resolutionNotes: this.resolutionNotes,
      cancelledAt: this.cancelledAt,
      assignedAt: this.assignedAt,
      assignedTo: this.assignedTo
        ? { id: String(this.assignedTo.id), fullName: this.assignedTo.fullName() }
        : null,
      assignedBy: this.assignedBy
        ? { id: String(this.assignedBy.id), fullName: this.assignedBy.fullName() }
        : undefined,
      isUnclaimed: this.isUnclaimed(),
      traveller: this.traveller
        ? {
            id: String(this.traveller.id),
            fullName: this.traveller.fullName(),
            phone: this.traveller.phone,
            emergencyContact: this.traveller.emergencyContactName
              ? {
                  name: this.traveller.emergencyContactName,
                  phone: this.traveller.emergencyContactPhone,
                  relationship: this.traveller.emergencyContactRelationship,
                }
              : null,
          }
        : undefined,
      booking: this.booking
        ? {
            id: String(this.booking.id),
            reference: this.booking.reference,
            title: this.booking.title,
          }
        : undefined,
    };
  };

  return SosAlert;
};
