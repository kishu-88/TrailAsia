'use strict';

const bcrypt = require('bcryptjs');
require('dotenv').config();

/**
 * Staff accounts — one per role.
 *
 * Filename kept as `initial-admin` on purpose: sequelize-cli records seeders by
 * filename in `SequelizeData`, so renaming it would make this look like a new
 * seeder and re-run it on machines that have already seeded.
 *
 * Four accounts are created so the team can sign in as each role and see how the
 * interface actually differs — a consultant has no Verify button, finance sees a
 * masked passport number and no Staff nav item, only an admin can reach account
 * management. Reading that in a permissions table is not the same as sitting in
 * front of it.
 *
 * Credentials come from the environment, with local development defaults so the
 * app runs immediately after `npm run db:seed` with no .env editing. Those
 * defaults are refused outright when NODE_ENV=production — a known password in a
 * public repository is only harmless while nothing real is behind it.
 *
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *   SEED_COORDINATOR_EMAIL / SEED_COORDINATOR_PASSWORD
 *   SEED_CONSULTANT_EMAIL / SEED_CONSULTANT_PASSWORD
 *   SEED_FINANCE_EMAIL / SEED_FINANCE_PASSWORD
 *   SEED_DEFAULT_PASSWORD   — fallback for any of the four
 */

/** Local-only password. Long enough to pass validation, obvious enough to never ship. */
const DEV_PASSWORD = 'trailasia-dev-password';

const ACCOUNTS = [
  {
    key: 'ADMIN',
    role: 'admin',
    firstName: 'Demo',
    lastName: 'Administrator',
    defaultEmail: 'admin@trailasia.local',
  },
  {
    key: 'COORDINATOR',
    role: 'coordinator',
    firstName: 'Demo',
    lastName: 'Coordinator',
    defaultEmail: 'coordinator@trailasia.local',
  },
  {
    key: 'CONSULTANT',
    role: 'consultant',
    firstName: 'Demo',
    lastName: 'Consultant',
    defaultEmail: 'consultant@trailasia.local',
  },
  {
    key: 'FINANCE',
    role: 'finance',
    firstName: 'Demo',
    lastName: 'Finance',
    defaultEmail: 'finance@trailasia.local',
  },
];

function resolve(account) {
  const email = (process.env[`SEED_${account.key}_EMAIL`] || account.defaultEmail)
    .trim()
    .toLowerCase();

  const explicit =
    process.env[`SEED_${account.key}_PASSWORD`] || process.env.SEED_DEFAULT_PASSWORD || '';

  return {
    ...account,
    email,
    password: explicit || DEV_PASSWORD,
    usingDefault: !explicit,
  };
}

module.exports = {
  async up(queryInterface) {
    const isProduction = process.env.NODE_ENV === 'production';
    const resolved = ACCOUNTS.map(resolve);

    // Guard first, so production never gets a half-seeded set of known logins.
    if (isProduction) {
      const insecure = resolved.filter((account) => account.usingDefault);
      if (insecure.length > 0) {
        throw new Error(
          'Refusing to seed default passwords with NODE_ENV=production. Set ' +
            insecure.map((account) => `SEED_${account.key}_PASSWORD`).join(', ') +
            ' (or SEED_DEFAULT_PASSWORD) to real values first.'
        );
      }
    }

    const tooShort = resolved.filter((account) => account.password.length < 12);
    if (tooShort.length > 0) {
      throw new Error(
        `Seed password too short for: ${tooShort
          .map((account) => account.key)
          .join(', ')}. Use at least 12 characters.`
      );
    }

    const rounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const now = new Date();
    const created = [];
    const skipped = [];

    for (const account of resolved) {
      // eslint-disable-next-line no-await-in-loop
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        { replacements: [account.email] }
      );

      // Seeding twice must not duplicate an account, and must never quietly
      // reset a password someone has already changed.
      if (existing.length > 0) {
        skipped.push(account);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert('users', [
        {
          first_name: account.firstName,
          last_name: account.lastName,
          email: account.email,
          password_hash: await bcrypt.hash(account.password, rounds),
          role: account.role,
          is_active: true,
          failed_login_attempts: 0,
          created_at: now,
          updated_at: now,
        },
      ]);

      created.push(account);
    }

    report(created, skipped, isProduction);
  },

  async down(queryInterface) {
    const emails = ACCOUNTS.map((account) => resolve(account).email);

    // Bookings reference their consultant with ON DELETE RESTRICT, so this fails
    // once seeded accounts own real records. That is the safe failure: undoing a
    // seeder should never take bookings with it.
    await queryInterface.bulkDelete('users', {
      email: emails,
    });
  },
};

/** Print what happened, so nobody has to read the file to find the login. */
function report(created, skipped, isProduction) {
  /* eslint-disable no-console */
  if (created.length === 0 && skipped.length > 0) {
    console.log('\nStaff accounts already exist — nothing created.');
    return;
  }

  console.log('\nStaff accounts created:\n');
  for (const account of created) {
    const shown = isProduction || !account.usingDefault ? '(set in your .env)' : account.password;
    console.log(`  ${account.role.padEnd(12)} ${account.email.padEnd(32)} ${shown}`);
  }

  if (skipped.length > 0) {
    console.log(`\n  Skipped (already present): ${skipped.map((a) => a.role).join(', ')}`);
  }

  if (!isProduction && created.some((account) => account.usingDefault)) {
    console.log(
      '\n  These are development defaults. Change them before this is deployed' +
        '\n  anywhere real, or set SEED_*_PASSWORD in .env before seeding.\n'
    );
  }
}
