'use strict';

/**
 * Teach the session table about travellers.
 *
 * One table for both kinds of session, not two. Rotation, reuse detection and
 * the "revoke everything" path are the security-critical parts of this design,
 * and having a second copy of them for travellers is how one copy quietly
 * stops matching the other.
 *
 * `subject_type` says which column is populated. `user_id` becomes nullable,
 * which is the price of the single table; the model enforces that exactly one
 * of the two is set.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('refresh_tokens', 'subject_type', {
      type: Sequelize.ENUM('staff', 'traveller'),
      allowNull: false,
      defaultValue: 'staff',
    });

    await queryInterface.addColumn('refresh_tokens', 'traveller_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'travellers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.changeColumn('refresh_tokens', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addIndex('refresh_tokens', ['traveller_id'], {
      name: 'idx_refresh_tokens_traveller',
    });
  },

  async down(queryInterface, Sequelize) {
    // Traveller sessions cannot survive a rollback: their subject column is
    // about to disappear, and a row with neither subject is worse than no row.
    await queryInterface.bulkDelete('refresh_tokens', { subject_type: 'traveller' });

    await queryInterface.removeIndex('refresh_tokens', 'idx_refresh_tokens_traveller');
    await queryInterface.removeColumn('refresh_tokens', 'traveller_id');
    await queryInterface.removeColumn('refresh_tokens', 'subject_type');

    await queryInterface.changeColumn('refresh_tokens', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },
};
