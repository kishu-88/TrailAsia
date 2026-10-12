'use strict';

/**
 * A position a traveller's phone reported while sharing was switched on.
 *
 * Retention is the point of this table's design. Rows are purged
 * LOCATION_RETENTION_DAYS after the trip ends (see src/jobs/purgeLocations.js),
 * because the agency's reason for holding somebody's movements expires when the
 * trip does. Nothing here is needed for accounting, so nothing here needs to
 * outlive the trip.
 *
 * Coordinates are DECIMAL(9,6) — about 0.1 m of resolution, and exact, which a
 * float is not.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'location_pings',
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
        booking_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'bookings', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        latitude: { type: Sequelize.DECIMAL(9, 6), allowNull: false },
        longitude: { type: Sequelize.DECIMAL(9, 6), allowNull: false },
        accuracy_metres: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        altitude_metres: { type: Sequelize.INTEGER, allowNull: true },
        // A phone at 4% battery on a pass is a different situation from one at
        // 90%, and whoever is reading the last known position should see it.
        battery_percent: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        source: {
          type: Sequelize.ENUM('device', 'manual', 'sos'),
          allowNull: false,
          defaultValue: 'device',
        },
        recorded_at: { type: Sequelize.DATE, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    // The query that matters is "where is this party now", so the index is
    // ordered to serve the newest row per traveller on a booking.
    await queryInterface.addIndex('location_pings', ['booking_id', 'traveller_id', 'recorded_at'], {
      name: 'idx_location_pings_booking_traveller_time',
    });
    await queryInterface.addIndex('location_pings', ['recorded_at'], {
      name: 'idx_location_pings_recorded_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('location_pings');
  },
};
