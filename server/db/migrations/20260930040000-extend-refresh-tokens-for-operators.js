'use strict';

/**
 * Teach the session table about operators.
 *
 * Third subject type in the same table, for the same reason travellers
 * joined it instead of getting their own: one rotation/reuse-detection/
 * revoke-everything implementation, not three. `operator_id` becomes the
 * third nullable subject column; the model enforces that exactly one of
 * `user_id`/`traveller_id`/`operator_id` is set.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('refresh_tokens', 'subject_type', {
      type: Sequelize.ENUM('staff', 'traveller', 'operator'),
      allowNull: false,
      defaultValue: 'staff',
    });

    await queryInterface.addColumn('refresh_tokens', 'operator_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'operators', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addIndex('refresh_tokens', ['operator_id'], {
      name: 'idx_refresh_tokens_operator',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('refresh_tokens', { subject_type: 'operator' });

    await queryInterface.removeIndex('refresh_tokens', 'idx_refresh_tokens_operator');
    await queryInterface.removeColumn('refresh_tokens', 'operator_id');

    await queryInterface.changeColumn('refresh_tokens', 'subject_type', {
      type: Sequelize.ENUM('staff', 'traveller'),
      allowNull: false,
      defaultValue: 'staff',
    });
  },
};
