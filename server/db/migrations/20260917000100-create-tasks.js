'use strict';

/**
 * A piece of work somebody has to do about a booking.
 *
 * The problem this table exists for is stated in the business case: nobody can
 * see a booking's true state without asking the consultant who owns it. Work
 * lives in one person's memory, their inbox, and a WhatsApp thread. A shared
 * queue with an owner and a due date is the smallest thing that fixes that.
 *
 * Tasks come from two places and the difference matters, so it is a column.
 * A `manual` task is something a person decided to do. A `readiness` task was
 * generated from a document gap the checklist already knows about — the agency
 * should not have to re-notice, by hand, something the system can already see.
 * `source_key` makes that generation idempotent: running it again updates the
 * existing row rather than filling the queue with duplicates.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'tasks',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        booking_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'bookings', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        // Set when the task is about one member of the party — "chase Mira's
        // visa" rather than "confirm the Lukla flights".
        traveller_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'travellers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        title: { type: Sequelize.STRING(200), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        category: {
          type: Sequelize.ENUM('documents', 'payment', 'operator', 'itinerary', 'admin', 'other'),
          allowNull: false,
          defaultValue: 'other',
        },
        status: {
          type: Sequelize.ENUM('open', 'in_progress', 'blocked', 'done', 'cancelled'),
          allowNull: false,
          defaultValue: 'open',
        },
        priority: {
          type: Sequelize.ENUM('low', 'normal', 'high', 'urgent'),
          allowNull: false,
          defaultValue: 'normal',
        },
        // A date, not a timestamp. "Due the 14th" is the 14th in Sydney and in
        // Kathmandu; a due *time* would be wrong in one of them.
        due_on: { type: Sequelize.DATEONLY, allowNull: true },

        // Nullable on purpose. An unassigned task is a real and useful state —
        // it is the queue everyone can see and nobody has picked up, which is
        // exactly what goes missing when work lives in an inbox.
        assigned_to_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        created_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        source: {
          type: Sequelize.ENUM('manual', 'readiness'),
          allowNull: false,
          defaultValue: 'manual',
        },
        // Stable identity for a generated task, e.g. readiness:<travellerId>:<requirementId>.
        // Unique per booking so regeneration updates instead of duplicating.
        source_key: { type: Sequelize.STRING(120), allowNull: true },

        blocked_reason: { type: Sequelize.STRING(500), allowNull: true },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        completed_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addConstraint('tasks', {
      fields: ['booking_id', 'source_key'],
      type: 'unique',
      name: 'uq_tasks_booking_source_key',
    });

    // The two questions the queue screen asks: "what is mine" and "what is due".
    await queryInterface.addIndex('tasks', ['assigned_to_user_id', 'status', 'due_on'], {
      name: 'idx_tasks_assignee_status_due',
    });
    await queryInterface.addIndex('tasks', ['status', 'due_on'], {
      name: 'idx_tasks_status_due',
    });
    await queryInterface.addIndex('tasks', ['booking_id'], { name: 'idx_tasks_booking' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tasks');
  },
};
