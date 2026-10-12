'use strict';

/**
 * Lets staff hand an open SOS to a specific person, separate from
 * acknowledging it themselves.
 *
 * `acknowledgedByUserId` already records "I am personally on this" — but the
 * person at the desk at 2am is not always the right person to run it, and
 * until now the only way to route an alert to, say, the on-call coordinator
 * was to ring them. `assignedToUserId` is that explicit hand-off, independent
 * of the alert's own raised/acknowledged/resolved status: an alert can be
 * assigned to someone before anybody has acknowledged it, and acknowledging
 * does not require being the assignee.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sos_alerts', 'assigned_to_user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('sos_alerts', 'assigned_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('sos_alerts', 'assigned_by_user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('sos_alerts', ['assigned_to_user_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('sos_alerts', ['assigned_to_user_id']);
    await queryInterface.removeColumn('sos_alerts', 'assigned_by_user_id');
    await queryInterface.removeColumn('sos_alerts', 'assigned_at');
    await queryInterface.removeColumn('sos_alerts', 'assigned_to_user_id');
  },
};
