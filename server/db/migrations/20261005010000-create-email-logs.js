'use strict';

/**
 * A record of every email send attempt, Mailgun or otherwise.
 *
 * Nothing upstream ever had visibility into whether an email actually went
 * out — `mailer.service.js` only `console.log`/`console.error`'d, which is
 * fine for a developer tailing the server but useless for an admin asking
 * "did that traveller's invite actually arrive?" days later. This table is
 * that answer, independent of whatever Mailgun itself retains.
 *
 * One row per attempt, not per logical event — `notify()` calling this for
 * three recipients writes three rows, which is what lets "did it reach
 * person B" be answered without re-deriving it from the notification table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'email_logs',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        to_address: { type: Sequelize.STRING(255), allowNull: false },
        subject: { type: Sequelize.STRING(255), allowNull: false },
        // What triggered it — "notification:sos_escalated",
        // "portal_invite:traveller" — free text rather than a FK, since the
        // three things that send email today (notifications, traveller
        // invites, operator invites) don't share one parent table.
        context: { type: Sequelize.STRING(120), allowNull: true },
        status: {
          type: Sequelize.ENUM('sent', 'failed', 'skipped'),
          allowNull: false,
        },
        // Why, when status is not 'sent': a Mailgun error body, a network
        // error's message, or 'not_configured' / 'no_recipient' for a skip.
        error: { type: Sequelize.TEXT, allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('email_logs', ['created_at'], {
      name: 'idx_email_logs_created_at',
    });
    await queryInterface.addIndex('email_logs', ['status'], {
      name: 'idx_email_logs_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_logs');
  },
};
