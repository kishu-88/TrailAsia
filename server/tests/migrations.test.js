'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

/**
 * The one check this suite makes against the migrations themselves.
 *
 * Everything else here runs on SQLite with a schema built by `sync()` from
 * the models, so a migration that does the wrong thing on MySQL is invisible
 * — and one did, for weeks: `changeColumn` with a `references` block makes
 * Sequelize's MySQL dialect emit `ADD FOREIGN KEY` and silently drop the
 * rest of the definition, so a column meant to become nullable stayed
 * NOT NULL while the migration was recorded as applied. Traveller and
 * operator sign-in both failed on a real database because of it.
 *
 * No MySQL server is needed. Each migration's `up` runs against a
 * MySQL-dialect query interface whose `query` is replaced with a recorder,
 * and the statements `changeColumn` produced are inspected.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

// Shipped with the bug and already applied on real databases, so it is
// repaired by a later migration rather than edited in place.
const REPAIRED_ELSEWHERE = {
  '20260914000200-extend-refresh-tokens-for-travellers.js':
    '20261005020000-make-refresh-token-user-id-nullable.js',
};

function recordingInterface() {
  const sequelize = new Sequelize('mysql://user:pass@localhost:3306/none', { logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const statements = [];
  let insideChangeColumn = false;

  sequelize.query = async (sql) => {
    if (insideChangeColumn) statements.push(typeof sql === 'string' ? sql : sql.query);
    return [[], 0];
  };

  const changeColumn = queryInterface.changeColumn.bind(queryInterface);
  queryInterface.changeColumn = async (...args) => {
    insideChangeColumn = true;
    try {
      return await changeColumn(...args);
    } finally {
      insideChangeColumn = false;
    }
  };

  return { queryInterface, statements };
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.js'));

describe('migrations on MySQL', () => {
  it.each(files)('%s: changeColumn alters the column rather than adding a key', async (file) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const migration = require(path.join(MIGRATIONS_DIR, file));
    const { queryInterface, statements } = recordingInterface();

    await migration.up(queryInterface, Sequelize);

    const dropped = statements.filter((sql) => /ADD FOREIGN KEY/i.test(sql));

    if (REPAIRED_ELSEWHERE[file]) {
      // Still broken, by design — but the repair it relies on must exist.
      expect(files).toContain(REPAIRED_ELSEWHERE[file]);
      return;
    }

    expect(dropped).toEqual([]);
  });
});
