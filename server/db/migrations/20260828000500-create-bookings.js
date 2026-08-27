'use strict';

/**
 * A booking: one trip for one party, from enquiry through to completion.
 *
 * Money is DECIMAL with an explicit currency column — the agency quotes in AUD
 * but settles with ground operators in local currency, and a float would lose
 * cents on every reconciliation.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'bookings',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        reference: { type: Sequelize.STRING(20), allowNull: false, unique: true },
        title: { type: Sequelize.STRING(200), allowNull: false },
        status: {
          type: Sequelize.ENUM(
            'enquiry',
            'quoted',
            'confirmed',
            'in_progress',
            'completed',
            'cancelled'
          ),
          allowNull: false,
          defaultValue: 'enquiry',
        },

        consultant_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        coordinator_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        lead_traveller_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'travellers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        departure_date: { type: Sequelize.DATEONLY, allowNull: true },
        return_date: { type: Sequelize.DATEONLY, allowNull: true },
        party_size: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 1,
        },

        currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
        deposit_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },

        notes: { type: Sequelize.TEXT, allowNull: true },
        cancelled_at: { type: Sequelize.DATE, allowNull: true },
        cancellation_reason: { type: Sequelize.STRING(500), allowNull: true },

        created_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('bookings', ['status'], { name: 'idx_bookings_status' });
    await queryInterface.addIndex('bookings', ['consultant_id'], {
      name: 'idx_bookings_consultant',
    });
    await queryInterface.addIndex('bookings', ['departure_date'], {
      name: 'idx_bookings_departure',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bookings');
  },
};
