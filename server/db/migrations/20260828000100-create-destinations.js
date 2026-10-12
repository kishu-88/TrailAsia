'use strict';

/** Destination countries and regions the agency runs programmes in. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'destinations',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        // Short internal code. Not always an ISO country — the agency runs
        // programmes in regions (Tibet) that do not have their own code.
        code: { type: Sequelize.STRING(10), allowNull: false, unique: true },
        name: { type: Sequelize.STRING(120), allowNull: false },
        country_code: { type: Sequelize.CHAR(2), allowNull: true },
        region: { type: Sequelize.STRING(60), allowNull: true },
        currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        // Drives the altitude-cover check on traveller insurance.
        max_altitude_metres: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        advisory_notes: { type: Sequelize.TEXT, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('destinations', ['is_active'], {
      name: 'idx_destinations_is_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('destinations');
  },
};
