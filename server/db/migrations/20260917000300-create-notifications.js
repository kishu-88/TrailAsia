'use strict';

/**
 * One row per person per thing they should know about.
 *
 * Fanned out at write time rather than computed at read time. A feed assembled
 * on every page load has to re-derive "has this person seen it" from somewhere
 * anyway, and the somewhere is a table like this one — so it may as well be the
 * record itself. It also means a notification says what was true when it was
 * raised, which is the point: "SOS raised by Ang Dorje" should still read that
 * way after the alert is resolved.
 *
 * Nothing here leaves the application. These are the bell in the top bar, not
 * email or SMS — the agency has not chosen a provider, and inventing one would
 * mean shipping a delivery path nobody has tested against a real emergency.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notifications',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        // The recipient. One row per person, so read state is per person —
        // a shared row with a join table would be smaller and would make
        // "mark as read" a write to somebody else's data.
        user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        // Who caused it. Null when the platform did — an overdue sweep, say.
        actor_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        type: {
          type: Sequelize.ENUM(
            'sos_raised',
            'sos_acknowledged',
            'sos_resolved',
            'task_assigned',
            'task_handover',
            'task_overdue',
            'document_verified',
            'document_rejected',
            'portal_activated',
            'booking_cancelled'
          ),
          allowNull: false,
        },
        severity: {
          type: Sequelize.ENUM('info', 'warning', 'urgent'),
          allowNull: false,
          defaultValue: 'info',
        },
        title: { type: Sequelize.STRING(200), allowNull: false },
        body: { type: Sequelize.STRING(500), allowNull: true },
        // Client route to open when the notification is clicked. A route, not a
        // URL: the API has no business knowing the client's host.
        link: { type: Sequelize.STRING(200), allowNull: true },

        /**
         * Stops a repeating condition raising a new row every time it is
         * noticed. "Task 14 is overdue" is one fact however many times the
         * sweep runs; unique per recipient, so two people can each be told once.
         */
        dedupe_key: { type: Sequelize.STRING(120), allowNull: true },

        read_at: { type: Sequelize.DATE, allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    // The bell's query: this person's unread, newest first.
    await queryInterface.addIndex('notifications', ['user_id', 'read_at', 'created_at'], {
      name: 'idx_notifications_user_unread',
    });
    await queryInterface.addConstraint('notifications', {
      fields: ['user_id', 'dedupe_key'],
      type: 'unique',
      name: 'uq_notifications_user_dedupe',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
