'use strict';

/**
 * Actually make `refresh_tokens.user_id` nullable.
 *
 * `20260914000200-extend-refresh-tokens-for-travellers` meant to do this and
 * did not. It called `changeColumn` with a `references` block, and on MySQL
 * Sequelize turns that into
 *
 *     ALTER TABLE `refresh_tokens` ADD FOREIGN KEY (`user_id`) REFERENCES ...
 *
 * — a second foreign key, and nothing else. The nullability change is
 * dropped without an error, so the migration is recorded as applied while
 * the column stays NOT NULL. Every traveller and operator session insert
 * (which leaves `user_id` empty by design) has therefore failed on MySQL
 * since those portals shipped: activation and sign-in both end in a 500.
 *
 * The test suite could not see it. Tests build the schema from the models
 * with `sync()` on SQLite and never run a migration, which is the trade-off
 * `tests/setup.js` describes — this is the first time it has cost something.
 *
 * No `references` here on purpose: a plain definition is what makes MySQL
 * emit `CHANGE`, and `CHANGE` leaves the existing foreign key in place. The
 * duplicate key the earlier migration added is harmless and is left alone
 * rather than dropped by a guessed constraint name.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('refresh_tokens', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
    });
  },

  // Nothing to undo. Nullable is what the schema was always supposed to be
  // from 20260914000200 onwards, and putting NOT NULL back would fail on any
  // database that holds a traveller or operator session.
  async down() {},
};
