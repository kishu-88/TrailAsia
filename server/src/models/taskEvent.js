'use strict';

/**
 * One entry in a task's history. Append-only — nothing here is ever updated or
 * deleted, because the value of the trail is that it cannot be tidied up after
 * the fact.
 */
module.exports = (sequelize, DataTypes) => {
  const TaskEvent = sequelize.define(
    'TaskEvent',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      taskId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      type: {
        type: DataTypes.ENUM(
          'created',
          'assigned',
          'unassigned',
          'status_changed',
          'note',
          'edited',
          'handover'
        ),
        allowNull: false,
      },
      actorUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      fromValue: { type: DataTypes.STRING(120), allowNull: true },
      toValue: { type: DataTypes.STRING(120), allowNull: true },
      note: { type: DataTypes.STRING(1000), allowNull: true },
    },
    { tableName: 'task_events', underscored: true }
  );

  TaskEvent.associate = (models) => {
    TaskEvent.belongsTo(models.Task, { foreignKey: 'taskId', as: 'task' });
    TaskEvent.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actor' });
  };

  TaskEvent.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      taskId: String(this.taskId),
      type: this.type,
      // `null` actor means the platform did it. The client renders that as
      // "automatically" rather than inventing a name for it.
      actor: this.actor
        ? { id: String(this.actor.id), fullName: this.actor.fullName() }
        : null,
      fromValue: this.fromValue,
      toValue: this.toValue,
      note: this.note,
      createdAt: this.createdAt,
    };
  };

  return TaskEvent;
};
