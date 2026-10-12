'use strict';

/**
 * Lets a document point at the operator confirmation it belongs to.
 *
 * A permit is the clearest case: it exists because a specific ground operator
 * arranged it for a specific booking, and "which arrangement got us this
 * paper" is exactly the question a coordinator asks when a permit is missing
 * or wrong. Nullable — most documents (a passport, a personal insurance
 * policy) have no operator arrangement behind them at all.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('traveller_documents', 'operator_confirmation_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'operator_confirmations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('traveller_documents', ['operator_confirmation_id'], {
      name: 'idx_traveller_documents_operator_confirmation',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'traveller_documents',
      'idx_traveller_documents_operator_confirmation'
    );
    await queryInterface.removeColumn('traveller_documents', 'operator_confirmation_id');
  },
};
