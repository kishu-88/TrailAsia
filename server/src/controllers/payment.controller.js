'use strict';

const paymentService = require('../services/payment.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- Schedules -------------------------------------------------------------

const listSchedules = handle(async (req, res) => {
  res.json(await paymentService.listSchedules(req.validatedQuery || req.query));
});

const getSchedule = handle(async (req, res) => {
  const schedule = await paymentService.getSchedule(req.params.scheduleId);
  res.json({ data: { schedule: schedule.toPublicJSON() } });
});

const addSchedule = handle(async (req, res) => {
  const schedule = await paymentService.addSchedule(req.body, req.user);
  res.status(201).json({ data: { schedule: schedule.toPublicJSON() } });
});

const updateSchedule = handle(async (req, res) => {
  const schedule = await paymentService.updateSchedule(
    req.params.scheduleId,
    req.body,
    req.user
  );
  res.json({ data: { schedule: schedule.toPublicJSON() } });
});

const closeSchedule = handle(async (req, res) => {
  const schedule = await paymentService.closeSchedule(
    req.params.scheduleId,
    req.body,
    req.user
  );
  res.json({ data: { schedule: schedule.toPublicJSON() } });
});

// --- Payments --------------------------------------------------------------

const listPayments = handle(async (req, res) => {
  res.json(await paymentService.listPayments(req.validatedQuery || req.query));
});

const getPayment = handle(async (req, res) => {
  const payment = await paymentService.getPayment(req.params.paymentId);
  res.json({ data: { payment: payment.toPublicJSON() } });
});

const recordPayment = handle(async (req, res) => {
  const payment = await paymentService.recordPayment(req.body, req.user);
  res.status(201).json({ data: { payment: payment.toPublicJSON() } });
});

const updatePayment = handle(async (req, res) => {
  const payment = await paymentService.updatePayment(req.params.paymentId, req.body, req.user);
  res.json({ data: { payment: payment.toPublicJSON() } });
});

const settlePayment = handle(async (req, res) => {
  const payment = await paymentService.settlePayment(req.params.paymentId, req.body, req.user);
  res.json({ data: { payment: payment.toPublicJSON() } });
});

// --- Reconciliation --------------------------------------------------------

const bookingSummary = handle(async (req, res) => {
  res.json({ data: await paymentService.bookingSummary(req.params.bookingId) });
});

const outstanding = handle(async (req, res) => {
  res.json(await paymentService.outstanding(req.validatedQuery || req.query));
});

const summary = handle(async (req, res) => {
  res.json({ data: await paymentService.summary() });
});

module.exports = {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  closeSchedule,

  listPayments,
  getPayment,
  recordPayment,
  updatePayment,
  settlePayment,

  bookingSummary,
  outstanding,
  summary,
};
