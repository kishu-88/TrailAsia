'use strict';

const app = require('./app');
const env = require('./config/env');
const { sequelize } = require('./models');

async function start() {
  try {
    await sequelize.authenticate();
    // eslint-disable-next-line no-console
    console.log(`Connected to MySQL database "${env.db.name}" at ${env.db.host}:${env.db.port}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not connect to the database:', error.message);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `TrailAsia API listening on http://localhost:${env.port}${env.apiPrefix} (${env.nodeEnv})`
    );
  });

  const shutdown = (signal) => async () => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received, shutting down.`);
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

start();
