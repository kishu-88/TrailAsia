'use strict';

/**
 * Travel-guide content for the public TrailAsia Book destination pages —
 * the practical "should I go, and what do I bring" information that sits
 * alongside the marketing fields (`summary`, `highlights`, etc. from
 * `add-destination-marketing-fields`) rather than replacing them. Same
 * reasoning as that migration: every column is optional, because staff are
 * backfilling this destination by destination, and `whatToPack` is JSON for
 * the same reason `highlights` is — a short ordered list nobody queries
 * across, so a child table would only add a join.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('destinations', 'best_time_to_visit', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'fitness_level', {
      type: Sequelize.ENUM('easy', 'moderate', 'challenging', 'strenuous'),
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'what_to_pack', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'culture_notes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('destinations', 'best_time_to_visit');
    await queryInterface.removeColumn('destinations', 'fitness_level');
    await queryInterface.removeColumn('destinations', 'what_to_pack');
    await queryInterface.removeColumn('destinations', 'culture_notes');
  },
};
