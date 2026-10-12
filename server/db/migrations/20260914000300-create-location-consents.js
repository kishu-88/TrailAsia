'use strict';

/**
 * One traveller's decision about location sharing, for one trip.
 *
 * Consent is per booking, not per person, and it is recorded rather than
 * assumed. Australian Privacy Principle 3 wants collection of sensitive
 * personal information to rest on consent that was actually given; a row here
 * with a timestamp is what that looks like in a database.
 *
 * Withdrawal keeps the row — it is a record that consent was given and then
 * taken back, and the withdrawal time is what bounds any pings that were
 * collected. Deleting it would erase the evidence that the collection was ever
 * lawful.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'location_consents',
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
        status: {
          type: Sequelize.ENUM('granted', 'withdrawn'),
          allowNull: false,
          defaultValue: 'withdrawn',
        },
        granted_at: { type: Sequelize.DATE, allowNull: true },
        withdrawn_at: { type: Sequelize.DATE, allowNull: true },
        // What the traveller was told when they agreed. Kept verbatim so a
        // later change to the wording cannot be mistaken for what they saw.
        consent_statement: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addConstraint('location_consents', {
      fields: ['traveller_id', 'booking_id'],
      type: 'unique',
      name: 'uq_location_consent_traveller_booking',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('location_consents');
  },
};
