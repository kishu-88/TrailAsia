'use strict';

const bcrypt = require('bcryptjs');
require('dotenv').config();

/**
 * Creates the first administrator so someone can log in and provision the rest
 * of the team. Credentials come from the environment — no default password is
 * baked into the repository.
 *
 *   SEED_ADMIN_EMAIL=admin@himalayastravel.com.au
 *   SEED_ADMIN_PASSWORD=<something long>
 */
module.exports = {
  async up(queryInterface) {
    const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || '';

    if (!email || !password) {
      throw new Error(
        'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env before running db:seed.'
      );
    }
    if (password.length < 12) {
      throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
    }

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      { replacements: [email] }
    );
    if (existing.length > 0) {
      // Seeding twice should not blow up or silently reset someone's password.
      return;
    }

    const rounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        first_name: 'Platform',
        last_name: 'Administrator',
        email,
        password_hash: await bcrypt.hash(password, rounds),
        role: 'admin',
        is_active: true,
        failed_login_attempts: 0,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) return;
    await queryInterface.bulkDelete('users', { email });
  },
};
