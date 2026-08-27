'use strict';

const { Op } = require('sequelize');

const { Destination, DocumentRequirement, ItinerarySegment } = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');

const SORTABLE = ['name', 'code', 'createdAt', 'region'];

async function list(query) {
  const options = parseListQuery(query, { sortable: SORTABLE, defaultSort: 'name:asc' });
  const where = {};

  if (query.region) where.region = query.region;
  if (query.isActive !== undefined && query.isActive !== '') {
    where.isActive = ['1', 'true', 'yes'].includes(String(query.isActive).toLowerCase());
  }
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [{ name: { [Op.like]: term } }, { code: { [Op.like]: term } }];
  }

  const result = await Destination.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  return paginated(result, options, (row) => row.toJSON());
}

async function getById(id, { withRequirements = false } = {}) {
  const destination = await Destination.findByPk(id, {
    include: withRequirements
      ? [
          {
            model: DocumentRequirement,
            as: 'documentRequirements',
            required: false,
          },
        ]
      : [],
    order: withRequirements ? [[{ model: DocumentRequirement, as: 'documentRequirements' }, 'type', 'ASC']] : undefined,
  });
  if (!destination) throw ApiError.notFound('Destination not found.');
  return destination;
}

async function create(payload) {
  const clash = await Destination.findOne({ where: { code: String(payload.code).toUpperCase() } });
  if (clash) {
    throw ApiError.badRequest('A destination with that code already exists.', {
      code: 'CODE_IN_USE',
      details: { code: 'Already in use.' },
    });
  }
  return Destination.create(payload);
}

async function update(id, changes) {
  const destination = await getById(id);
  if (changes.code && changes.code.toUpperCase() !== destination.code) {
    const clash = await Destination.findOne({
      where: { code: changes.code.toUpperCase(), id: { [Op.ne]: destination.id } },
    });
    if (clash) {
      throw ApiError.badRequest('A destination with that code already exists.', {
        code: 'CODE_IN_USE',
        details: { code: 'Already in use.' },
      });
    }
  }
  await destination.update(changes);
  return destination;
}

/**
 * Retire a destination rather than deleting it. Historic itineraries reference
 * it, and a completed 2024 Nepal trek should not lose its destination because
 * the agency stopped selling that programme.
 */
async function deactivate(id) {
  const destination = await getById(id);
  await destination.update({ isActive: false });
  return destination;
}

async function reactivate(id) {
  const destination = await getById(id);
  await destination.update({ isActive: true });
  return destination;
}

/**
 * Hard delete, allowed only while nothing references it — otherwise the caller
 * is told to deactivate instead.
 */
async function destroy(id) {
  const destination = await getById(id);
  const inUse = await ItinerarySegment.count({ where: { destinationId: destination.id } });
  if (inUse > 0) {
    throw ApiError.badRequest(
      `This destination is used by ${inUse} itinerary segment(s). Deactivate it instead of deleting it.`,
      { code: 'DESTINATION_IN_USE' }
    );
  }
  await destination.destroy();
}

// --- Document requirements -------------------------------------------------

async function listRequirements(destinationId, { includeInactive = false } = {}) {
  await getById(destinationId);
  const where = { destinationId };
  if (!includeInactive) where.isActive = true;
  return DocumentRequirement.findAll({
    where,
    order: [
      ['type', 'ASC'],
      ['name', 'ASC'],
    ],
  });
}

async function getRequirement(id) {
  const requirement = await DocumentRequirement.findByPk(id);
  if (!requirement) throw ApiError.notFound('Document requirement not found.');
  return requirement;
}

async function addRequirement(destinationId, payload) {
  await getById(destinationId);
  const clash = await DocumentRequirement.findOne({
    where: { destinationId, type: payload.type, name: payload.name },
  });
  if (clash) {
    throw ApiError.badRequest(
      'That requirement already exists for this destination.',
      { code: 'REQUIREMENT_EXISTS' }
    );
  }
  return DocumentRequirement.create({ ...payload, destinationId });
}

async function updateRequirement(id, changes) {
  const requirement = await getRequirement(id);
  await requirement.update(changes);
  return requirement;
}

async function deleteRequirement(id) {
  const requirement = await getRequirement(id);
  await requirement.destroy();
}

module.exports = {
  list,
  getById,
  create,
  update,
  deactivate,
  reactivate,
  destroy,
  listRequirements,
  getRequirement,
  addRequirement,
  updateRequirement,
  deleteRequirement,
};
