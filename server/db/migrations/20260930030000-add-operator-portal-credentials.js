'use strict';

/**
 * Portal credentials for operators.
 *
 * Mirrors `20260914000100-add-traveller-portal-credentials.js` exactly — same
 * columns, same reasoning: an operator is not staff and does not get a row in
 * `users`, so their credential lives on the operator record rather than in a
 * parallel account table. There is no self-registration; a consultant issues
 * an invite, the operator sets a password with it, and `portal_enabled` is
 * what an administrator turns off if access should stop, separately from
 * `is_active`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('operators', 'password_hash', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'portal_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('operators', 'invite_token_hash', {
      type: Sequelize.CHAR(64),
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'invite_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'invite_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'portal_activated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'last_login_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('operators', 'failed_login_attempts', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('operators', 'locked_until', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('operators', ['invite_token_hash'], {
      name: 'idx_operators_invite_token',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('operators', 'idx_operators_invite_token');
    for (const column of [
      'password_hash',
      'portal_enabled',
      'invite_token_hash',
      'invite_expires_at',
      'invite_sent_at',
      'portal_activated_at',
      'last_login_at',
      'failed_login_attempts',
      'locked_until',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn('operators', column);
    }
  },
};
