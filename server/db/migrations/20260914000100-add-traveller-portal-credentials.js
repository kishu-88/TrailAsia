'use strict';

/**
 * Portal credentials for travellers.
 *
 * Travellers sign in to see their own trip; they are not staff and do not get a
 * row in `users`. Keeping the credential on the traveller record rather than
 * inventing a parallel account table means there is exactly one place a person
 * exists, and no way for a traveller record and a login to drift apart.
 *
 * There is no self-registration. A consultant issues an invitation, the
 * traveller sets a password with it, and `portal_enabled` is what an
 * administrator turns off if access should stop — separately from `is_active`,
 * which is about the traveller record itself.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('travellers', 'password_hash', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'portal_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    // Only the hash is stored, so the invitation cannot be replayed from a
    // database dump — the same reasoning as refresh tokens.
    await queryInterface.addColumn('travellers', 'invite_token_hash', {
      type: Sequelize.CHAR(64),
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'invite_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'invite_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'portal_activated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'last_login_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('travellers', 'failed_login_attempts', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('travellers', 'locked_until', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('travellers', ['invite_token_hash'], {
      name: 'idx_travellers_invite_token',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('travellers', 'idx_travellers_invite_token');
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
      await queryInterface.removeColumn('travellers', column);
    }
  },
};
