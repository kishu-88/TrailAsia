'use strict';

/**
 * Quotes from past travellers, shown on the public site.
 *
 * `destination_id` is nullable — a testimonial about the agency in general
 * ("They got us home safely when the road washed out") is not about any one
 * trek, and forcing one would mean either inventing a destination for it or
 * losing it. `is_published` exists because a testimonial usually comes in
 * from a consultant pasting an email, and it should not go live until
 * someone decides it is ready to.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'testimonials',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        destination_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'destinations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        author_name: { type: Sequelize.STRING(160), allowNull: false },
        trip_reference: { type: Sequelize.STRING(20), allowNull: true },
        quote: { type: Sequelize.TEXT, allowNull: false },
        rating: { type: Sequelize.TINYINT.UNSIGNED, allowNull: true },
        is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('testimonials', ['destination_id'], {
      name: 'idx_testimonials_destination',
    });
    await queryInterface.addIndex('testimonials', ['is_published'], {
      name: 'idx_testimonials_published',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('testimonials');
  },
};
