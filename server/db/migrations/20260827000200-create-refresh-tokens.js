'use strict';

/** Rotating refresh tokens. Only the SHA-256 hash of each token is stored. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'refresh_tokens',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        replaced_by_hash: { type: Sequelize.CHAR(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(255), allowNull: true },
        ip_address: { type: Sequelize.STRING(45), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_general_ci',
        engine: 'InnoDB',
      }
    );

    await queryInterface.addIndex('refresh_tokens', ['user_id'], {
      name: 'idx_refresh_tokens_user_id',
    });
    // Used by the cleanup job that removes expired rows.
    await queryInterface.addIndex('refresh_tokens', ['expires_at'], {
      name: 'idx_refresh_tokens_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
