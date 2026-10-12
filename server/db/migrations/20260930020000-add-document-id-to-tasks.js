'use strict';

/**
 * Lets a task point at the specific document it is about.
 *
 * `category: 'documents'` already existed, but nothing tied a task back to
 * *which* `TravellerDocument` it concerned beyond the free-text title —
 * fine for the auto-generated readiness chasers (they are about a gap, not
 * a row), but not for "assign this submitted passport to someone to
 * review", which is about one document specifically. Nullable: readiness
 * tasks and every other category still have none.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tasks', 'document_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tasks', 'document_id');
  },
};
