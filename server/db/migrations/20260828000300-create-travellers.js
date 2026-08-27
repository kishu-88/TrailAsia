'use strict';

/**
 * Traveller records.
 *
 * Contains personal information covered by the Privacy Act 1988, including
 * passport details and free-text medical notes, which are sensitive information
 * under the Act. Access is restricted at the route layer and passport numbers
 * are masked on the way out of the API.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'travellers',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        first_name: { type: Sequelize.STRING(100), allowNull: false },
        last_name: { type: Sequelize.STRING(100), allowNull: false },
        email: { type: Sequelize.STRING(255), allowNull: true },
        phone: { type: Sequelize.STRING(40), allowNull: true },
        date_of_birth: { type: Sequelize.DATEONLY, allowNull: true },
        nationality: { type: Sequelize.CHAR(2), allowNull: true },

        passport_number: { type: Sequelize.STRING(60), allowNull: true },
        passport_country: { type: Sequelize.CHAR(2), allowNull: true },
        passport_expiry: { type: Sequelize.DATEONLY, allowNull: true },

        emergency_contact_name: { type: Sequelize.STRING(160), allowNull: true },
        emergency_contact_phone: { type: Sequelize.STRING(40), allowNull: true },
        emergency_contact_relationship: { type: Sequelize.STRING(60), allowNull: true },

        dietary_notes: { type: Sequelize.TEXT, allowNull: true },
        medical_notes: { type: Sequelize.TEXT, allowNull: true },

        created_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('travellers', ['last_name', 'first_name'], {
      name: 'idx_travellers_name',
    });
    await queryInterface.addIndex('travellers', ['email'], { name: 'idx_travellers_email' });
    await queryInterface.addIndex('travellers', ['is_active'], {
      name: 'idx_travellers_is_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('travellers');
  },
};
