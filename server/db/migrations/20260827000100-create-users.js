'use strict';

/** Staff accounts for the TrailAsia portal. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'users',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        first_name: { type: Sequelize.STRING(100), allowNull: false },
        last_name: { type: Sequelize.STRING(100), allowNull: false },
        email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        role: {
          type: Sequelize.ENUM('consultant', 'coordinator', 'finance', 'admin'),
          allowNull: false,
          defaultValue: 'consultant',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        last_login_at: { type: Sequelize.DATE, allowNull: true },
        failed_login_attempts: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        locked_until: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_general_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('users', ['role'], { name: 'idx_users_role' });
    await queryInterface.addIndex('users', ['is_active'], {
      name: 'idx_users_is_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
    // MySQL keeps the ENUM as part of the column, so dropping the table is enough.
  },
};
