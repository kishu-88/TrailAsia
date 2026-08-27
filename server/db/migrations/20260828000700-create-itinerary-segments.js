'use strict';

/**
 * One leg of a booking's itinerary.
 *
 * A three-week Nepal trek with a Bhutan extension is two or more segments, each
 * with its own destination — which is what makes the per-destination document
 * checklist computable instead of something a consultant assembles by hand.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'itinerary_segments',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        booking_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'bookings', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        destination_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'destinations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        sequence: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        title: { type: Sequelize.STRING(200), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        start_date: { type: Sequelize.DATEONLY, allowNull: true },
        end_date: { type: Sequelize.DATEONLY, allowNull: true },
        accommodation: { type: Sequelize.STRING(300), allowNull: true },
        transport_notes: { type: Sequelize.TEXT, allowNull: true },
        max_altitude_metres: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addConstraint('itinerary_segments', {
      fields: ['booking_id', 'sequence'],
      type: 'unique',
      name: 'uq_itinerary_booking_sequence',
    });
    await queryInterface.addIndex('itinerary_segments', ['destination_id'], {
      name: 'idx_itinerary_destination',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('itinerary_segments');
  },
};
