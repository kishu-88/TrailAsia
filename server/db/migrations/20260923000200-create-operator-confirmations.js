'use strict';

/**
 * One thing we have asked a ground operator to confirm for one booking.
 *
 * This is the table the module exists for. A booking's true state today depends
 * on remembering which operators have replied, and that memory lives with one
 * consultant. A row per request, with a status and a deadline, makes "what are
 * we still waiting on" answerable by anyone.
 *
 * `due_by` is the date we need an answer, not the date of the service. Those are
 * different, and conflating them is how a trek gets three days out with no
 * confirmed guide while the system cheerfully reports nothing overdue.
 *
 * Money is recorded here because what we owe an operator is agreed at
 * confirmation time. It is DECIMAL with its own currency column, like every
 * other amount in the system — the agency settles with operators in local
 * currency and quotes travellers in AUD.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'operator_confirmations',
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
        operator_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'operators', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        // Which leg of the itinerary this covers. Nullable: some arrangements
        // span the whole trip. Set to null rather than cascading when a segment
        // is deleted — the operator was still asked, and that is a fact.
        itinerary_segment_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'itinerary_segments', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        service_type: {
          type: Sequelize.ENUM(
            'guide',
            'accommodation',
            'transport',
            'permits',
            'equipment',
            'other'
          ),
          allowNull: false,
          defaultValue: 'other',
        },
        summary: { type: Sequelize.STRING(300), allowNull: false },
        details: { type: Sequelize.TEXT, allowNull: true },

        status: {
          type: Sequelize.ENUM('pending', 'requested', 'confirmed', 'declined', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending',
        },

        // Their reference for it — the thing a consultant currently digs out of
        // an email thread when the operator asks "which booking?"
        operator_reference: { type: Sequelize.STRING(120), allowNull: true },

        due_by: { type: Sequelize.DATEONLY, allowNull: true },
        requested_at: { type: Sequelize.DATE, allowNull: true },
        responded_at: { type: Sequelize.DATE, allowNull: true },

        currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },

        decline_reason: { type: Sequelize.STRING(500), allowNull: true },

        created_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        updated_by_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('operator_confirmations', ['booking_id'], {
      name: 'idx_op_conf_booking',
    });
    await queryInterface.addIndex('operator_confirmations', ['operator_id'], {
      name: 'idx_op_conf_operator',
    });
    await queryInterface.addIndex('operator_confirmations', ['status'], {
      name: 'idx_op_conf_status',
    });
    // The chase list sorts on this across every open booking.
    await queryInterface.addIndex('operator_confirmations', ['due_by'], {
      name: 'idx_op_conf_due_by',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('operator_confirmations');
  },
};
