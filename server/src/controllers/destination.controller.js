'use strict';

const destinationService = require('../services/destination.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await destinationService.list(req.query));
});

const get = handle(async (req, res) => {
  const destination = await destinationService.getById(req.params.id, {
    withRequirements: true,
  });
  res.json({ data: { destination } });
});

const create = handle(async (req, res) => {
  const destination = await destinationService.create(req.body);
  res.status(201).json({ data: { destination } });
});

const update = handle(async (req, res) => {
  const destination = await destinationService.update(req.params.id, req.body);
  res.json({ data: { destination } });
});

const deactivate = handle(async (req, res) => {
  const destination = await destinationService.deactivate(req.params.id);
  res.json({ data: { destination } });
});

const reactivate = handle(async (req, res) => {
  const destination = await destinationService.reactivate(req.params.id);
  res.json({ data: { destination } });
});

const destroy = handle(async (req, res) => {
  await destinationService.destroy(req.params.id);
  res.status(204).send();
});

const listRequirements = handle(async (req, res) => {
  const requirements = await destinationService.listRequirements(req.params.id, {
    includeInactive: String(req.query.includeInactive).toLowerCase() === 'true',
  });
  res.json({ data: requirements });
});

const addRequirement = handle(async (req, res) => {
  const requirement = await destinationService.addRequirement(req.params.id, req.body);
  res.status(201).json({ data: { requirement } });
});

const updateRequirement = handle(async (req, res) => {
  const requirement = await destinationService.updateRequirement(
    req.params.requirementId,
    req.body
  );
  res.json({ data: { requirement } });
});

const deleteRequirement = handle(async (req, res) => {
  await destinationService.deleteRequirement(req.params.requirementId);
  res.status(204).send();
});

module.exports = {
  list,
  get,
  create,
  update,
  deactivate,
  reactivate,
  destroy,
  listRequirements,
  addRequirement,
  updateRequirement,
  deleteRequirement,
};
