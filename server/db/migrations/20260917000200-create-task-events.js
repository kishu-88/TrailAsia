'use strict';

/**
 * Everything that has happened to a task.
 *
 * Handovers are the reason this table exists. "Bibek is on leave, Vishal has her
 * bookings" is currently a sentence somebody says, and a fortnight later nobody
 * can reconstruct who was supposed to chase which visa. An append-only row per
 * change turns that into a record: who reassigned what, when, and what they said
 * about it.
 *
 * Notes live here too rather than in a separate comments table. A note and a
 * reassignment are the same kind of thing from the reader's point of view — one
 * chronological thread on the task — and splitting them would mean interleaving
 * two queries to show it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'task_events',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        task_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'tasks', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        type: {
          type: Sequelize.ENUM(
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
        // Null when the platform did it — generating a task from a readiness gap,
        // or closing one because the gap was filled. Shown as "automatically",
        // never attributed to whoever happened to trigger the sync.
        actor_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        from_value: { type: Sequelize.STRING(120), allowNull: true },
        to_value: { type: Sequelize.STRING(120), allowNull: true },
        note: { type: Sequelize.STRING(1000), allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('task_events', ['task_id', 'created_at'], {
      name: 'idx_task_events_task_time',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('task_events');
  },
};
