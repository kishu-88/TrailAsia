'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const env = require('../config/env');
const config = require('../config/config')[env.nodeEnv] || require('../config/config').development;

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

const db = {};
const basename = path.basename(__filename);

// Load every model file in this folder except this one.
fs.readdirSync(__dirname)
  .filter(
    (file) =>
      !file.startsWith('.') &&
      file !== basename &&
      file.endsWith('.js') &&
      !file.endsWith('.test.js')
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// Wire up associations once every model is registered.
Object.keys(db).forEach((name) => {
  if (typeof db[name].associate === 'function') {
    db[name].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
