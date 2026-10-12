'use strict';

/**
 * The ledger. One row per movement of money, in either direction.
 *
 * Three decisions in this table are worth reading before changing it.
 *
 * **No card data, ever.** `reference` holds a bank transfer reference or the
 * identifier a payment gateway gave back — nothing else. There is no column for
 * a card number, an expiry or a CVV, and there must not be one: storing them
 * puts the agency inside PCI DSS scope, which Section 8.3 of the business case
 * explicitly rules out by keeping card handling with the gateway.
 *
 * **The exchange rate is stored, not recomputed.** A payment in NPR against an
 * AUD booking is converted once, at the moment it is recorded, and both the rate
 * used and the converted figure are written down. Recomputing later from today's
 * rate would mean last March's reconciliation quietly changes value every time
 * somebody opens it, which is not a record of anything.
 *
 * **Nothing is deleted or edited into a different amount.** A payment keyed
 * wrongly is marked `failed`; money sent back to a traveller is `refunded`. Both
 * carry a reason. The row stays, because the audit trail is the point — Section
 * 8.2 asks for duty separation, and separation without a trail is decoration.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'payments',
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

        // Which instalment this settles. Nullable: travellers pay ad hoc, and a
        // payment that matches no plan is still money in the bank. SET NULL
        // rather than CASCADE — deleting a plan must never delete the ledger.
        payment_schedule_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'payment_schedules', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        // What this settles on the way out: a confirmed ground operator's cost.
        operator_confirmation_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'operator_confirmations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },

        direction: {
          type: Sequelize.ENUM('incoming', 'outgoing'),
          allowNull: false,
          defaultValue: 'incoming',
        },
        method: {
          type: Sequelize.ENUM(
            'bank_transfer',
            'card',
            'cash',
            'cheque',
            'agent_credit',
            'other'
          ),
          allowNull: false,
          defaultValue: 'bank_transfer',
        },
        status: {
          type: Sequelize.ENUM('pending', 'cleared', 'failed', 'refunded'),
          allowNull: false,
          defaultValue: 'pending',
        },

        // What actually moved, in the currency it moved in.
        currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },

        // The same amount in the booking's currency, converted once, here.
        // Eight decimal places on the rate because thinly traded pairs need
        // them — NPR to AUD sits around 0.01187500, and two places would round
        // it to 0.01, an eighteen per cent error.
        base_currency_code: { type: Sequelize.CHAR(3), allowNull: false, defaultValue: 'AUD' },
        exchange_rate: {
          type: Sequelize.DECIMAL(16, 8),
          allowNull: false,
          defaultValue: 1,
        },
        amount_in_base: { type: Sequelize.DECIMAL(12, 2), allowNull: false },

        // Bank or gateway reference only. See the note at the top of this file.
        reference: { type: Sequelize.STRING(120), allowNull: true },

        received_on: { type: Sequelize.DATEONLY, allowNull: false },
        cleared_at: { type: Sequelize.DATE, allowNull: true },
        settled_reason: { type: Sequelize.STRING(500), allowNull: true },

        notes: { type: Sequelize.TEXT, allowNull: true },

        recorded_by_user_id: {
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

    await queryInterface.addIndex('payments', ['booking_id'], {
      name: 'idx_payment_booking',
    });
    await queryInterface.addIndex('payments', ['payment_schedule_id'], {
      name: 'idx_payment_schedule',
    });
    await queryInterface.addIndex('payments', ['status'], { name: 'idx_payment_status' });
    await queryInterface.addIndex('payments', ['received_on'], {
      name: 'idx_payment_received_on',
    });

    // The same bank reference cannot be banked twice in the same direction.
    // Double-keying a transfer — once from the bank statement, once from the
    // traveller's email — is the most common reconciliation error there is, and
    // a unique index catches it at the moment it happens rather than at the
    // month-end that does not balance. MySQL permits repeated NULLs in a unique
    // index, so payments with no reference (cash) are unaffected.
    await queryInterface.addIndex('payments', ['direction', 'reference'], {
      name: 'uniq_payment_reference',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};
