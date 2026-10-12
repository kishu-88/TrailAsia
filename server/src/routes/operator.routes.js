'use strict';

const express = require('express');

const operatorController = require('../controllers/operator.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../validators/common');
const {
  createOperatorSchema,
  updateOperatorSchema,
  vettingSchema,
  createConfirmationSchema,
  updateConfirmationSchema,
  respondSchema,
  listQuerySchema,
} = require('../validators/operator.validators');

const router = express.Router();

router.use(authenticate);

/**
 * Who does what.
 *
 * Everyone reads — finance needs operator costs to reconcile against, and a
 * consultant needs to see who is confirmed before promising a traveller
 * anything.
 *
 * Consultants and coordinators raise and chase confirmations, because that is
 * the daily work of running a departure.
 *
 * Only coordinators and admins maintain the directory and grant vetting. The
 * partner network is the agency's competitive position (Section 2.4), and who
 * gets added to it is not a decision to make in the middle of closing a sale.
 */
const canRead = requireRole(requireRole.ANY_STAFF);
const canChase = requireRole(requireRole.TRIP_EDITORS);
const canCurate = requireRole(requireRole.REFERENCE_EDITORS);

// Fixed paths before `/:id`, or "summary" and "outstanding" parse as operator ids.
router.get('/summary', canRead, operatorController.summary);
router.get(
  '/outstanding',
  canRead,
  validateQuery(listQuerySchema),
  operatorController.outstanding
);

// --- Confirmations ---------------------------------------------------------
// Mounted under /operators rather than nested inside /bookings: a confirmation
// belongs to the operator relationship as much as to the trip, and the chase
// list reads across every booking at once.

router.get(
  '/confirmations',
  canRead,
  validateQuery(listQuerySchema),
  operatorController.listConfirmations
);
router.post(
  '/confirmations',
  canChase,
  validateBody(createConfirmationSchema),
  operatorController.addConfirmation
);
router.get('/confirmations/:confirmationId', canRead, operatorController.getConfirmation);
router.patch(
  '/confirmations/:confirmationId',
  canChase,
  validateBody(updateConfirmationSchema),
  operatorController.updateConfirmation
);
router.post(
  '/confirmations/:confirmationId/request',
  canChase,
  operatorController.markRequested
);
router.post(
  '/confirmations/:confirmationId/respond',
  canChase,
  validateBody(respondSchema),
  operatorController.respond
);
router.delete(
  '/confirmations/:confirmationId',
  canChase,
  operatorController.cancelConfirmation
);

// Operator coverage for one booking — the counterpart to document readiness.
router.get('/bookings/:bookingId/readiness', canRead, operatorController.bookingReadiness);

// --- Directory -------------------------------------------------------------

router.get('/', canRead, validateQuery(listQuerySchema), operatorController.list);
router.post('/', canCurate, validateBody(createOperatorSchema), operatorController.create);

router.get('/:id', canRead, operatorController.get);
router.patch('/:id', canCurate, validateBody(updateOperatorSchema), operatorController.update);
router.post('/:id/vetting', canCurate, validateBody(vettingSchema), operatorController.setVetting);
router.delete('/:id', canCurate, operatorController.deactivate);
router.post('/:id/reactivate', canCurate, operatorController.reactivate);

// Portal access — same duty split as vetting: granting an operator a login is
// a directory decision, not a day-to-day chasing one.
router.post('/:id/portal-invite', canCurate, operatorController.issuePortalInvite);
router.delete('/:id/portal-access', canCurate, operatorController.revokePortalAccess);

module.exports = router;
