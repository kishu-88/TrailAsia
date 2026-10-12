'use strict';

/**
 * An SOS raised by a traveller from the app.
 *
 * Alerts are never deleted and never silently closed. Every state change
 * records who made it and when, because the question after an incident is
 * always "when did the agency know, and what did it do" — and an answer that
 * depends on somebody's memory of a WhatsApp thread is the problem this
 * platform exists to fix.
 *
 * A cancelled alert is a false alarm the traveller withdrew. A resolved alert
 * is one the agency closed. They are different facts and are stored separately.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sos_alerts',
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
          onDelete: 'RESTRICT',
        },
        booking_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'bookings', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        status: {
          type: Sequelize.ENUM('raised', 'acknowledged', 'resolved', 'cancelled'),
          allowNull: false,
          defaultValue: 'raised',
        },
        raised_at: { type: Sequelize.DATE, allowNull: false },
        // Position at the moment the button was pressed, if the phone had one.
        // Copied onto the alert rather than joined to a ping, so it survives the
        // location retention purge — an incident record is not location tracking.
        latitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        longitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
        accuracy_metres: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        message: { type: Sequelize.STRING(500), allowNull: true },

        acknowledged_at: { type: Sequelize.DATE, allowNull: true },
        acknowledged_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        resolved_at: { type: Sequelize.DATE, allowNull: true },
        resolved_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        resolution_notes: { type: Sequelize.TEXT, allowNull: true },
        cancelled_at: { type: Sequelize.DATE, allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('sos_alerts', ['status', 'raised_at'], {
      name: 'idx_sos_alerts_status_raised',
    });
    await queryInterface.addIndex('sos_alerts', ['booking_id'], {
      name: 'idx_sos_alerts_booking',
    });
    await queryInterface.addIndex('sos_alerts', ['traveller_id'], {
      name: 'idx_sos_alerts_traveller',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sos_alerts');
  },
};
