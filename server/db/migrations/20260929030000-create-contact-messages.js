'use strict';

/**
 * A message sent through the public site's "About / Contact" page — not a
 * booking enquiry (no destination, no dates, no party size; often not even
 * about a trip at all — "do you handle group bookings for a school",
 * "I sent an enquiry last week and haven't heard back"). Keeping it out of
 * `bookings` means a question with no trip attached doesn't have to be
 * force-fitted into the booking lifecycle the way `createPublicEnquiry`
 * deliberately does for an actual enquiry.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'contact_messages',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        name: { type: Sequelize.STRING(160), allowNull: false },
        email: { type: Sequelize.STRING(255), allowNull: false },
        phone: { type: Sequelize.STRING(40), allowNull: true },
        message: { type: Sequelize.TEXT, allowNull: false },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('contact_messages', ['created_at'], {
      name: 'idx_contact_messages_created_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contact_messages');
  },
};
