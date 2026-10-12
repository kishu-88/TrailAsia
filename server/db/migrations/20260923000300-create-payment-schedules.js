'use strict';

/**
 * The payment plan for a booking: what the traveller agreed to pay, and when.
 *
 * This table holds the *plan*, not the money. Nothing here ever changes because
 * a payment arrived — a schedule row is a promise, and a promise stays on the
 * record whether or not it was kept. What was actually received lives in
 * `payments`, and everything the reconciliation screen shows is those two read
 * against each other.
 *
 * Keeping them apart is the whole design. A single "amount_paid" column on the
 * schedule would be a second source of truth for money, and the first time it
 * disagreed with the ledger nobody would know which one was right.
 *
 * `status` therefore has only the three values a person can choose. Whether an
 * instalment is paid, part paid or overdue is derived from the ledger, every
 * time it is asked, and so cannot drift.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'payment_schedules',
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

        // "Deposit", "Second instalment", "Final balance". Free text on purpose:
        // the agency's plans vary by trip and an enum would be outgrown by the
        // first group booking that pays in five parts.
        label: { type: Sequelize.STRING(120), allowNull: false },
        sequence: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

        due_on: { type: Sequelize.DATEONLY, allowNull: false },

        currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },

        // Only what a human decides. Paid / part paid / overdue are computed
        // from the ledger and deliberately absent here.
        status: {
          type: Sequelize.ENUM('scheduled', 'waived', 'cancelled'),
          allowNull: false,
          defaultValue: 'scheduled',
        },
        // Required when waiving, enforced in the service. Writing off money a
        // traveller owes is exactly the decision that needs a name against it.
        waived_reason: { type: Sequelize.STRING(500), allowNull: true },

        notes: { type: Sequelize.TEXT, allowNull: true },

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

    await queryInterface.addIndex('payment_schedules', ['booking_id'], {
      name: 'idx_pay_sched_booking',
    });
    // The finance screen reads across every booking in due-date order.
    await queryInterface.addIndex('payment_schedules', ['due_on'], {
      name: 'idx_pay_sched_due_on',
    });
    await queryInterface.addIndex('payment_schedules', ['status'], {
      name: 'idx_pay_sched_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_schedules');
  },
};
