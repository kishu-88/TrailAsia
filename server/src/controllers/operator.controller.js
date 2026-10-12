'use strict';

const operatorService = require('../services/operator.service');
const operatorAuthService = require('../services/operatorAuth.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- Operators -------------------------------------------------------------

const list = handle(async (req, res) => {
  res.json(await operatorService.list(req.validatedQuery || req.query));
});

const summary = handle(async (req, res) => {
  res.json({ data: await operatorService.summary() });
});

const outstanding = handle(async (req, res) => {
  res.json(await operatorService.outstanding(req.validatedQuery || req.query));
});

const get = handle(async (req, res) => {
  const operator = await operatorService.getById(req.params.id, { withStats: true });
  res.json({ data: { operator: operator.toPublicJSON({ stats: operator.stats }) } });
});

const create = handle(async (req, res) => {
  const operator = await operatorService.create(req.body, req.user);
  res.status(201).json({ data: { operator: operator.toPublicJSON() } });
});

const update = handle(async (req, res) => {
  const operator = await operatorService.update(req.params.id, req.body);
  res.json({ data: { operator: operator.toPublicJSON() } });
});

const setVetting = handle(async (req, res) => {
  const operator = await operatorService.setVetting(req.params.id, req.body, req.user);
  res.json({ data: { operator: operator.toPublicJSON() } });
});

const deactivate = handle(async (req, res) => {
  const operator = await operatorService.deactivate(req.params.id);
  res.json({ data: { operator: operator.toPublicJSON() } });
});

const reactivate = handle(async (req, res) => {
  const operator = await operatorService.reactivate(req.params.id);
  res.json({ data: { operator: operator.toPublicJSON() } });
});

/**
 * Issue a portal invitation, same shape as the traveller one.
 *
 * The plaintext token comes back exactly once. Whoever is chasing this
 * operator passes it along themselves — there is no mail transport yet.
 */
const issuePortalInvite = handle(async (req, res) => {
  const result = await operatorAuthService.issueInvite(req.params.id);
  res.status(201).json({
    data: {
      ...result,
      delivery: 'Give this link to the operator yourself — the platform does not send email yet.',
    },
  });
});

/** Withdraw portal access and end every session the operator currently holds. */
const revokePortalAccess = handle(async (req, res) => {
  const operator = await operatorAuthService.revokeAccess(req.params.id);
  res.json({ data: { operator } });
});

// --- Confirmations ---------------------------------------------------------

const listConfirmations = handle(async (req, res) => {
  res.json(await operatorService.listConfirmations(req.validatedQuery || req.query));
});

const getConfirmation = handle(async (req, res) => {
  const confirmation = await operatorService.getConfirmation(req.params.confirmationId);
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const addConfirmation = handle(async (req, res) => {
  const confirmation = await operatorService.addConfirmation(req.body, req.user);
  res.status(201).json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const updateConfirmation = handle(async (req, res) => {
  const confirmation = await operatorService.updateConfirmation(
    req.params.confirmationId,
    req.body,
    req.user
  );
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const markRequested = handle(async (req, res) => {
  const confirmation = await operatorService.markRequested(req.params.confirmationId, req.user);
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const respond = handle(async (req, res) => {
  const confirmation = await operatorService.respond(
    req.params.confirmationId,
    req.body,
    req.user
  );
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const cancelConfirmation = handle(async (req, res) => {
  const confirmation = await operatorService.cancelConfirmation(
    req.params.confirmationId,
    req.user
  );
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const bookingReadiness = handle(async (req, res) => {
  res.json({ data: await operatorService.bookingReadiness(req.params.bookingId) });
});

module.exports = {
  list,
  summary,
  outstanding,
  get,
  create,
  update,
  setVetting,
  deactivate,
  reactivate,
  issuePortalInvite,
  revokePortalAccess,

  listConfirmations,
  getConfirmation,
  addConfirmation,
  updateConfirmation,
  markRequested,
  respond,
  cancelConfirmation,
  bookingReadiness,
};
