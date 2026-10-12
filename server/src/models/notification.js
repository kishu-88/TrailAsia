'use strict';

const TYPES = [
  'sos_raised',
  'sos_acknowledged',
  'sos_resolved',
  'task_assigned',
  'task_handover',
  'task_overdue',
  'document_verified',
  'document_rejected',
  'portal_activated',
  'booking_cancelled',
  'payment_received',
  'payment_failed',
  'payment_due_soon',
  'payment_overdue',
  'booking_enquiry_received',
  'document_submitted',
  'contact_message_received',
  'operator_declined',
  'operator_confirmation_requested',
  'sos_assigned',
  'sos_escalated',
];

module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      // Exactly one of these three is set — which one says who this
      // notification is for. Enforced in `beforeValidate` below rather than
      // with a DB constraint, the same reasoning as `RefreshToken`: a
      // portable "exactly one of" check isn't available across MySQL and
      // the SQLite the tests run against.
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      operatorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      actorUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
      severity: {
        type: DataTypes.ENUM('info', 'warning', 'urgent'),
        allowNull: false,
        defaultValue: 'info',
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.STRING(500), allowNull: true },
      link: { type: DataTypes.STRING(200), allowNull: true },
      dedupeKey: { type: DataTypes.STRING(120), allowNull: true },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'notifications',
      underscored: true,
      hooks: {
        // Same shape as RefreshToken's guard: a model validator would also run
        // against the partial instance Sequelize builds for a bulk update
        // (e.g. `markAllRead`'s `Notification.update(...)`), where none of the
        // three recipient columns are present at all — which would make that
        // call fail on rows that are perfectly valid. A creation hook only
        // runs on `create`/`findOrCreate`, where the full row is always given.
        beforeCreate(notification) {
          const recipientFields = [
            notification.userId,
            notification.travellerId,
            notification.operatorId,
          ];
          const set = recipientFields.filter((value) => value !== null && value !== undefined);
          if (set.length !== 1) {
            throw new Error(
              'A notification must have exactly one recipient (userId, travellerId or operatorId).'
            );
          }
        },
      },
    }
  );

  Notification.TYPES = TYPES;

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'recipient' });
    Notification.belongsTo(models.Traveller, { foreignKey: 'travellerId', as: 'travellerRecipient' });
    Notification.belongsTo(models.Operator, { foreignKey: 'operatorId', as: 'operatorRecipient' });
    Notification.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actor' });
  };

  Notification.prototype.isRead = function isRead() {
    return Boolean(this.readAt);
  };

  Notification.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      type: this.type,
      severity: this.severity,
      title: this.title,
      body: this.body,
      link: this.link,
      read: this.isRead(),
      readAt: this.readAt,
      // `null` actor means the platform raised it. The bell renders that as
      // "automatically" rather than attaching somebody's name to a sweep.
      actor: this.actor
        ? { id: String(this.actor.id), fullName: this.actor.fullName() }
        : null,
      createdAt: this.createdAt,
    };
  };

  return Notification;
};
