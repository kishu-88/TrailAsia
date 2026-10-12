'use strict';

const emailLogService = require('../services/emailLog.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await emailLogService.list(req.query));
});

module.exports = { list };
