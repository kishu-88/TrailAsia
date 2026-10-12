'use strict';

const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];
const OPEN_STATUSES = ['open', 'in_progress', 'blocked'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/**
 * Which status can follow which.
 *
 * Encoded here for the same reason booking transitions are: "done → open" is the
 * kind of move that quietly rewrites what happened, and a queue whose history
 * cannot be trusted is not worth having. Reopening a finished task is done by
 * raising a new one, which leaves both facts on the record.
 */
const ALLOWED_TRANSITIONS = {
  open: ['in_progress', 'blocked', 'done', 'cancelled'],
  in_progress: ['open', 'blocked', 'done', 'cancelled'],
  blocked: ['open', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define(
    'Task',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      // Set only for a task raised to review one specific document (see
      // `taskService.assignDocumentReviewer`) — everything else, including
      // the auto-generated readiness chasers, leaves this null.
      documentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true },
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      category: {
        type: DataTypes.ENUM('documents', 'payment', 'operator', 'itinerary', 'admin', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'open',
      },
      priority: {
        type: DataTypes.ENUM(...PRIORITIES),
        allowNull: false,
        defaultValue: 'normal',
      },
      dueOn: { type: DataTypes.DATEONLY, allowNull: true },

      assignedToUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      createdByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

      source: {
        type: DataTypes.ENUM('manual', 'readiness'),
        allowNull: false,
        defaultValue: 'manual',
      },
      sourceKey: { type: DataTypes.STRING(120), allowNull: true },

      blockedReason: { type: DataTypes.STRING(500), allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      completedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    { tableName: 'tasks', underscored: true }
  );

  Task.STATUSES = STATUSES;
  Task.OPEN_STATUSES = OPEN_STATUSES;
  Task.PRIORITIES = PRIORITIES;
  Task.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
  Task.PRIORITY_RANK = PRIORITY_RANK;

  Task.canTransition = function canTransition(from, to) {
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  };

  Task.associate = (models) => {
    Task.belongsTo(models.Booking, { foreignKey: 'bookingId', as: 'booking' });
    Task.belongsTo(models.Traveller, { foreignKey: 'travellerId', as: 'traveller' });
    Task.belongsTo(models.TravellerDocument, { foreignKey: 'documentId', as: 'document' });
    Task.belongsTo(models.User, { foreignKey: 'assignedToUserId', as: 'assignee' });
    Task.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    Task.belongsTo(models.User, { foreignKey: 'completedByUserId', as: 'completedBy' });
    Task.hasMany(models.TaskEvent, {
      foreignKey: 'taskId',
      as: 'events',
      onDelete: 'CASCADE',
    });
  };

  Task.prototype.isOpen = function isOpen() {
    return OPEN_STATUSES.includes(this.status);
  };

  /**
   * Days until this is due — negative when it is late.
   *
   * Computed here rather than in the client so the queue, the dashboard and the
   * booking panel cannot disagree about what "overdue" means on a given day.
   */
  Task.prototype.daysUntilDue = function daysUntilDue(today = new Date()) {
    if (!this.dueOn) return null;
    const due = new Date(`${this.dueOn}T00:00:00Z`);
    const now = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  };

  Task.prototype.isOverdue = function isOverdue(today = new Date()) {
    if (!this.isOpen()) return false;
    const days = this.daysUntilDue(today);
    return days !== null && days < 0;
  };

  Task.prototype.toPublicJSON = function toPublicJSON() {
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
      travellerId: this.travellerId ? String(this.travellerId) : null,
      traveller: this.traveller
        ? { id: String(this.traveller.id), fullName: this.traveller.fullName() }
        : undefined,
      documentId: this.documentId ? String(this.documentId) : null,
      document: this.document
        ? { id: String(this.document.id), type: this.document.type }
        : undefined,

      title: this.title,
      description: this.description,
      category: this.category,
      status: this.status,
      allowedNextStatuses: ALLOWED_TRANSITIONS[this.status] || [],
      isOpen: this.isOpen(),
      priority: this.priority,
      dueOn: this.dueOn,
      daysUntilDue: this.daysUntilDue(),
      overdue: this.isOverdue(),

      assignedToUserId: this.assignedToUserId ? String(this.assignedToUserId) : null,
      assignee: this.assignee
        ? { id: String(this.assignee.id), fullName: this.assignee.fullName() }
        : null,
      createdBy: this.createdBy
        ? { id: String(this.createdBy.id), fullName: this.createdBy.fullName() }
        : undefined,

      source: this.source,
      sourceKey: this.sourceKey,
      blockedReason: this.blockedReason,
      completedAt: this.completedAt,
      completedBy: this.completedBy
        ? { id: String(this.completedBy.id), fullName: this.completedBy.fullName() }
        : undefined,

      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      events: this.events ? this.events.map((event) => event.toPublicJSON()) : undefined,
    };
  };

  return Task;
};
