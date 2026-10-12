'use strict';

const TYPES = [
  'raised',
  'acknowledged',
  'assigned',
  'unassigned',
  'escalated',
  'resolved',
  'cancelled',
];

/**
 * One entry in an SOS alert's history. Append-only, like `TaskEvent`: nothing
 * here is updated or deleted, because the point of an incident trail is that
 * nobody can tidy it up afterwards.
 */
module.exports = (sequelize, DataTypes) => {
  const SosAlertEvent = sequelize.define(
    'SosAlertEvent',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      alertId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
      actorKind: {
        type: DataTypes.ENUM('traveller', 'staff', 'system'),
        allowNull: false,
      },
      actorUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      detail: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'sos_alert_events', underscored: true }
  );

  SosAlertEvent.TYPES = TYPES;

  SosAlertEvent.associate = (models) => {
    SosAlertEvent.belongsTo(models.SosAlert, { foreignKey: 'alertId', as: 'alert' });
    SosAlertEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actor' });
  };

  /**
   * `alert` is included when the caller loaded it (the log across every
   * alert needs to say whose alert each row is about; the history of a single
   * alert does not).
   */
  SosAlertEvent.prototype.toPublicJSON = function toPublicJSON() {
    const alert = this.alert;
    const traveller = alert && alert.traveller;

    let actorName = null;
    if (this.actorKind === 'staff') {
      // A deleted account leaves the event standing with no name attached.
      actorName = this.actor ? this.actor.fullName() : 'A former member of staff';
    } else if (this.actorKind === 'traveller') {
      actorName = traveller ? traveller.fullName() : 'The traveller';
    }

    return {
      id: String(this.id),
      alertId: String(this.alertId),
      type: this.type,
      actor: { kind: this.actorKind, name: actorName },
      detail: this.detail,
      createdAt: this.createdAt,
      alert: alert
        ? {
            id: String(alert.id),
            status: alert.status,
            traveller: traveller
              ? { id: String(traveller.id), fullName: traveller.fullName() }
              : null,
            booking: alert.booking
              ? {
                  id: String(alert.booking.id),
                  reference: alert.booking.reference,
                  title: alert.booking.title,
                }
              : null,
          }
        : undefined,
    };
  };

  return SosAlertEvent;
};
