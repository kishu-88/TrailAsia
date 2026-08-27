'use strict';

const userService = require('../services/user.service');

/** Wraps an async handler so a rejection reaches the error middleware. */
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await userService.list(req.query));
});

const get = handle(async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json({ data: { user: user.toPublicJSON() } });
});

const create = handle(async (req, res) => {
  const user = await userService.create(req.body);
  res.status(201).json({ data: { user: user.toPublicJSON() } });
});

const update = handle(async (req, res) => {
  const user = await userService.update(req.params.id, req.body, req.user);
  res.json({ data: { user: user.toPublicJSON() } });
});

const deactivate = handle(async (req, res) => {
  const user = await userService.deactivate(req.params.id, req.user);
  res.json({ data: { user: user.toPublicJSON() } });
});

const reactivate = handle(async (req, res) => {
  const user = await userService.reactivate(req.params.id);
  res.json({ data: { user: user.toPublicJSON() } });
});

const resetPassword = handle(async (req, res) => {
  await userService.resetPassword(req.params.id, req.body.password);
  res.status(204).send();
});

const unlock = handle(async (req, res) => {
  const user = await userService.unlock(req.params.id);
  res.json({ data: { user: user.toPublicJSON() } });
});

module.exports = {
  list,
  get,
  create,
  update,
  deactivate,
  reactivate,
  resetPassword,
  unlock,
};
