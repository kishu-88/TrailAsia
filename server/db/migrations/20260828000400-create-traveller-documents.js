'use strict';

/** A document a traveller holds, tracked against the destination that needs it. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'traveller_documents',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        traveller_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'travellers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        // Null for documents that are not destination-specific, such as a passport.
        destination_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'destinations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
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
        reference: { type: Sequelize.STRING(120), allowNull: true },
        issuer: { type: Sequelize.STRING(160), allowNull: true },
        issued_on: { type: Sequelize.DATEONLY, allowNull: true },
        expires_on: { type: Sequelize.DATEONLY, allowNull: true },
        status: {
          type: Sequelize.ENUM('outstanding', 'submitted', 'verified', 'rejected'),
          allowNull: false,
          defaultValue: 'outstanding',
        },
        // Insurance only: the altitude the policy actually covers to.
        altitude_cover_metres: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        // Insurance only: who to ring, so cover can be confirmed before agreeing
        // to an evacuation rather than after.
        insurer_contact_phone: { type: Sequelize.STRING(40), allowNull: true },

        verified_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        file_path: { type: Sequelize.STRING(500), allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('traveller_documents', ['traveller_id'], {
      name: 'idx_trav_docs_traveller',
    });
    await queryInterface.addIndex('traveller_documents', ['destination_id'], {
      name: 'idx_trav_docs_destination',
    });
    await queryInterface.addIndex('traveller_documents', ['status'], {
      name: 'idx_trav_docs_status',
    });
    await queryInterface.addIndex('traveller_documents', ['expires_on'], {
      name: 'idx_trav_docs_expires_on',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('traveller_documents');
  },
};
