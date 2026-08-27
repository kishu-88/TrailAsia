'use strict';

/**
 * Sequelize CLI configuration.
 *
 * sequelize-cli loads this file directly (see ../../.sequelizerc), so it must
 * stay CommonJS and must not import anything that expects the Express app to be
 * running. It reads the same .env as the rest of the server.
 */

require('dotenv').config();

const shared = {
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trailasia',
  // Traveller names and destination data are not Latin-only.
  charset: 'utf8mb4',
  collate: 'utf8mb4_0900_ai_ci',
  define: {
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },
  pool: {
    max: Number.parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions:
    (process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { ssl: { rejectUnauthorized: true } }
      : {},
  timezone: '+00:00', // store UTC, convert at the edges
};

module.exports = {
  development: { ...shared, logging: console.log },
  test: {
    ...shared,
    database: `${process.env.DB_NAME || 'trailasia'}_test`,
    logging: false,
  },
  production: { ...shared, logging: false },
};
