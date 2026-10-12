'use strict';

const { Op } = require('sequelize');

const { EmailLog } = require('../models');
const { parseListQuery, paginated } = require('../utils/pagination');

/**
 * Read-only. Nothing writes here except `mailer.service.js`'s own
 * `logAttempt` — this file exists to answer "did that email actually go
 * out", not to manage the log.
 */

const SORTABLE = ['createdAt'];

async function list(query) {
  const options = parseListQuery(query, { sortable: SORTABLE, defaultSort: 'createdAt:desc' });
  const where = {};

  if (query.status) where.status = query.status;
  if (query.context) where.context = query.context;
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [{ toAddress: { [Op.like]: term } }, { subject: { [Op.like]: term } }];
  }

  const result = await EmailLog.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (row) => row.toPublicJSON());
}

module.exports = { list };
