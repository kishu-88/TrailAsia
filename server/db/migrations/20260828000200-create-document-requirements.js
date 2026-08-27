'use strict';

/**
 * What a traveller must hold for a given destination.
 *
 * This table is the reason the platform can tell a consultant what is
 * outstanding fourteen days before departure instead of the consultant
 * remembering to check a second spreadsheet.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'document_requirements',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        destination_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'destinations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        type: {
          type: Sequelize.ENUM(
            'passport',
            'visa',
            'insurance',
            'health_declaration',
            'permit',
            'vaccination',
            'other'
          ),
          allowNull: false,
        },
        name: { type: Sequelize.STRING(160), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        is_mandatory: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        // How far ahead of departure this must be complete.
        lead_time_days: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 14,
        },
        // Passports commonly need six months' validity beyond the return date.
        min_validity_months: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        // Trekking insurance must state cover to a given altitude — the gap the
        // Nepal helicopter-evacuation fraud exploited.
        requires_altitude_cover: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('document_requirements', ['destination_id'], {
      name: 'idx_doc_req_destination',
    });
    await queryInterface.addConstraint('document_requirements', {
      fields: ['destination_id', 'type', 'name'],
      type: 'unique',
      name: 'uq_doc_req_destination_type_name',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('document_requirements');
  },
};
