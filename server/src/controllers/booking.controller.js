'use strict';

const bookingService = require('../services/booking.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await bookingService.list(req.query));
});

const get = handle(async (req, res) => {
  const booking = await bookingService.getById(req.params.id);
  res.json({ data: { booking: booking.toPublicJSON() } });
});

const create = handle(async (req, res) => {
  const booking = await bookingService.create(req.body, req.user);
  res.status(201).json({ data: { booking: booking.toPublicJSON() } });
});

const update = handle(async (req, res) => {
  const booking = await bookingService.update(req.params.id, req.body);
  res.json({ data: { booking: booking.toPublicJSON() } });
});

const cancel = handle(async (req, res) => {
  const booking = await bookingService.cancel(req.params.id, req.body.reason);
  res.json({ data: { booking: booking.toPublicJSON() } });
});

// --- Party -----------------------------------------------------------------

const addTraveller = handle(async (req, res) => {
  const booking = await bookingService.addTraveller(req.params.id, req.body.travellerId, {
    isLead: req.body.isLead,
    notes: req.body.notes,
  });
  res.status(201).json({ data: { booking: booking.toPublicJSON() } });
});

const removeTraveller = handle(async (req, res) => {
  const booking = await bookingService.removeTraveller(req.params.id, req.params.travellerId);
  res.json({ data: { booking: booking.toPublicJSON() } });
});

// --- Itinerary -------------------------------------------------------------

const listSegments = handle(async (req, res) => {
  const segments = await bookingService.listSegments(req.params.id);
  res.json({ data: segments.map((segment) => segment.toPublicJSON()) });
});

const addSegment = handle(async (req, res) => {
  const segment = await bookingService.addSegment(req.params.id, req.body);
  res.status(201).json({ data: { segment: segment.toPublicJSON() } });
});

const updateSegment = handle(async (req, res) => {
  const segment = await bookingService.updateSegment(req.params.segmentId, req.body);
  res.json({ data: { segment: segment.toPublicJSON() } });
});

const deleteSegment = handle(async (req, res) => {
  await bookingService.deleteSegment(req.params.segmentId);
  res.status(204).send();
});

const reorderSegments = handle(async (req, res) => {
  const segments = await bookingService.reorderSegments(req.params.id, req.body.segmentIds);
  res.json({ data: segments.map((segment) => segment.toPublicJSON()) });
});

const readiness = handle(async (req, res) => {
  res.json({ data: await bookingService.readiness(req.params.id) });
});

module.exports = {
  list,
  get,
  create,
  update,
  cancel,
  addTraveller,
  removeTraveller,
  listSegments,
  addSegment,
  updateSegment,
  deleteSegment,
  reorderSegments,
  readiness,
};
