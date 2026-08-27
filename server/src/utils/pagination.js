'use strict';

const ApiError = require('./ApiError');

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

/**
 * Read `page`, `perPage` and `sort` off a query string.
 *
 * `sort` is `field:direction`, e.g. `departureDate:asc`. The field is checked
 * against an allow-list supplied by the caller — user input must never reach an
 * ORDER BY clause unchecked.
 */
function parseListQuery(query, { sortable = [], defaultSort = 'createdAt:desc' } = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);

  const requestedPerPage = Number.parseInt(query.perPage, 10) || DEFAULT_PER_PAGE;
  const perPage = Math.min(Math.max(requestedPerPage, 1), MAX_PER_PAGE);

  const [rawField, rawDirection] = String(query.sort || defaultSort).split(':');
  const field = rawField || 'createdAt';
  const direction = String(rawDirection || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  if (sortable.length > 0 && !sortable.includes(field)) {
    throw ApiError.badRequest(`Cannot sort by "${field}".`, {
      code: 'INVALID_SORT',
      details: { sortable },
    });
  }

  return {
    page,
    perPage,
    limit: perPage,
    offset: (page - 1) * perPage,
    order: [[field, direction]],
  };
}

/** Wrap a Sequelize findAndCountAll result in the standard list envelope. */
function paginated({ rows, count }, { page, perPage }, mapper = (row) => row) {
  return {
    data: rows.map(mapper),
    meta: {
      page,
      perPage,
      total: count,
      totalPages: perPage > 0 ? Math.ceil(count / perPage) : 0,
    },
  };
}

module.exports = { parseListQuery, paginated, DEFAULT_PER_PAGE, MAX_PER_PAGE };
