'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/config.js',
  ],
  // Sequelize teardown occasionally trails a handle; fail loudly rather than hang.
  testTimeout: 20000,
  verbose: false,
};
