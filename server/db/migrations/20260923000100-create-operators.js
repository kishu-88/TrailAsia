'use strict';

/**
 * The agency's vetted ground partners.
 *
 * Section 2.1 of the business case describes how this currently works: the
 * consultant rings or emails an operator, and the reply lives in their phone.
 * The SWOT names it twice — "established relationships with vetted ground
 * operators" as a strength, and "partner confirmations held in personal inboxes
 * and messaging apps" as the weakness that undermines it. The relationship is
 * real; only the record of it is missing.
 *
 * `vetted_at` is a column rather than a flag because vetting is an event with a
 * date and a person attached. "Are they vetted?" is a weaker question than
 * "when, and by whom?" — and the second is the one that matters if something
 * goes wrong on a mountain.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'operators',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        name: { type: Sequelize.STRING(180), allowNull: false },
        destination_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'destinations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        // What they actually provide. An operator can be more than one thing,
        // but the primary type is what a consultant filters on when they need
        // "a guide in Nepal" rather than "anyone in Nepal".
        type: {
          type: Sequelize.ENUM(
            'guide',
            'accommodation',
            'transport',
            'permits',
            'equipment',
            'full_service',
            'other'
          ),
          allowNull: false,
          defaultValue: 'full_service',
        },

        contact_name: { type: Sequelize.STRING(160), allowNull: true },
        contact_email: { type: Sequelize.STRING(255), allowNull: true },
        contact_phone: { type: Sequelize.STRING(40), allowNull: true },
        // Recorded because it is how these relationships actually run. The point
        // of this module is not to stop people using WhatsApp — it is to stop the
        // *confirmation* living only there.
        whatsapp: { type: Sequelize.STRING(40), allowNull: true },

        // How many days they usually need to come back. Drives the default
        // response deadline on a confirmation.
        typical_response_days: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 3,
        },

        vetted_at: { type: Sequelize.DATE, allowNull: true },
        vetted_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        vetting_notes: { type: Sequelize.TEXT, allowNull: true },

        notes: { type: Sequelize.TEXT, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('operators', ['destination_id'], {
      name: 'idx_operators_destination',
    });
    await queryInterface.addIndex('operators', ['is_active'], {
      name: 'idx_operators_is_active',
    });
    await queryInterface.addConstraint('operators', {
      fields: ['destination_id', 'name'],
      type: 'unique',
      name: 'uq_operator_destination_name',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('operators');
  },
};
