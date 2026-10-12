'use strict';

/**
 * Marketing content for the public TrailAsia Book site, kept on `destinations`
 * rather than a side table: it describes the destination itself, not one
 * traveller's booking of it, and every field here is optional because staff
 * are still backfilling it destination by destination.
 *
 * `highlights` is JSON (an ordered array of short strings — "Sherpa-led
 * guides", "Everest Base Camp views") rather than a child table. A destination
 * has a handful of these, nobody queries across them, and a child table would
 * add a join to every public page for a list that is only ever read and
 * rewritten whole.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('destinations', 'summary', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'hero_image_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'highlights', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'duration_days', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'price_from_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('destinations', 'price_from_currency_code', {
      type: Sequelize.CHAR(3),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('destinations', 'summary');
    await queryInterface.removeColumn('destinations', 'hero_image_url');
    await queryInterface.removeColumn('destinations', 'highlights');
    await queryInterface.removeColumn('destinations', 'duration_days');
    await queryInterface.removeColumn('destinations', 'price_from_amount');
    await queryInterface.removeColumn('destinations', 'price_from_currency_code');
  },
};
