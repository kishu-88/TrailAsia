'use strict';

const taskService = require('../services/task.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await taskService.list(req.validatedQuery || req.query, req.user));
});

const summary = handle(async (req, res) => {
  res.json({ data: await taskService.summary(req.user) });
});

const get = handle(async (req, res) => {
  const task = await taskService.getById(req.params.id, { withEvents: true });
  res.json({ data: { task: task.toPublicJSON() } });
});

const create = handle(async (req, res) => {
  const task = await taskService.create(req.body, req.user);
  res.status(201).json({ data: { task: task.toPublicJSON() } });
});

const update = handle(async (req, res) => {
  const task = await taskService.update(req.params.id, req.body, req.user);
  res.json({ data: { task: task.toPublicJSON() } });
});

const assign = handle(async (req, res) => {
  const task = await taskService.assign(req.params.id, req.body, req.user);
  res.json({ data: { task: task.toPublicJSON() } });
});

const changeStatus = handle(async (req, res) => {
  const task = await taskService.changeStatus(req.params.id, req.body, req.user);
  res.json({ data: { task: task.toPublicJSON() } });
});

const addNote = handle(async (req, res) => {
  const task = await taskService.addNote(req.params.id, req.body.note, req.user);
  res.status(201).json({ data: { task: task.toPublicJSON() } });
});

const listEvents = handle(async (req, res) => {
  const events = await taskService.listEvents(req.params.id);
  res.json({ data: events.map((event) => event.toPublicJSON()) });
});

const syncFromReadiness = handle(async (req, res) => {
  const result = await taskService.syncFromReadiness(req.params.bookingId, req.user);
  res.json({ data: result });
});

const handover = handle(async (req, res) => {
  const result = await taskService.handover(req.body, req.user);
  res.json({ data: result });
});

const workload = handle(async (req, res) => {
  res.json({ data: await taskService.workload(req.params.userId) });
});

module.exports = {
  list,
  summary,
  get,
  create,
  update,
  assign,
  changeStatus,
  addNote,
  listEvents,
  syncFromReadiness,
  handover,
  workload,
};
