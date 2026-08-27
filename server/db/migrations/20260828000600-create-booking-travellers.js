'use strict';

/** Which travellers are on which booking. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'booking_travellers',
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
        traveller_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'travellers', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        is_lead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        notes: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' }
    );

    await queryInterface.addConstraint('booking_travellers', {
      fields: ['booking_id', 'traveller_id'],
      type: 'unique',
      name: 'uq_booking_traveller',
    });
    await queryInterface.addIndex('booking_travellers', ['traveller_id'], {
      name: 'idx_booking_travellers_traveller',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_travellers');
  },
};
