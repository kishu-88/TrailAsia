'use strict';

const express = require('express');

const controller = require('../controllers/safety.controller');
const authenticate = require('../middleware/authenticate');
const authenticateTraveller = require('../middleware/authenticateTraveller');
const requireRole = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../validators/common');
const {
  consentSchema,
  pingSchema,
  sosSchema,
  resolveSchema,
  assignSchema,
  alertQuerySchema,
  pingQuerySchema,
  summaryQuerySchema,
  eventQuerySchema,
} = require('../validators/safety.validators');

/**
 * Two audiences, one module, and no route that serves both.
 *
 * Everything under `/me` is the traveller acting on their own record, with the
 * id taken from their session. Everything under `/alerts` and `/bookings` is
 * staff acting on somebody else's, with a role check. Mixing the two on one
 * path is how a guard eventually gets the wrong one.
 */
const router = express.Router();

// --- Traveller ------------------------------------------------------------

router.get(
  '/me',
  authenticateTraveller,
  validateQuery(summaryQuerySchema),
  controller.summary
);

router.post(
  '/me/consent',
  authenticateTraveller,
  validateBody(consentSchema),
  controller.setConsent
);

router.post('/me/pings', authenticateTraveller, validateBody(pingSchema), controller.recordPing);

router.get(
  '/me/pings',
  authenticateTraveller,
  validateQuery(pingQuerySchema),
  controller.listPings
);

// No rate limiter on this route, deliberately. See safety.service.js: an SOS is
// never refused, and a throttle is a refusal wearing a different status code.
router.post('/me/sos', authenticateTraveller, validateBody(sosSchema), controller.raiseSos);

router.post('/me/sos/:id/cancel', authenticateTraveller, controller.cancelSos);

// --- Staff ----------------------------------------------------------------

/**
 * Reading alerts is open to every staff role, finance included.
 *
 * That is wider than the rest of the codebase and it is meant to be. An alert
 * raised at 2am must be visible to whoever is actually at a desk, and a role
 * check that hides it from the only person in the office is a worse outcome
 * than a finance officer seeing that somebody pressed a button.
 *
 * Acting on one is narrower: acknowledging or closing an alert is an
 * operational decision, and it is recorded against the person who made it.
 */
router.get(
  '/alerts',
  authenticate,
  requireRole(requireRole.ANY_STAFF),
  validateQuery(alertQuerySchema),
  controller.listAlerts
);

router.get(
  '/alerts/:id',
  authenticate,
  requireRole(requireRole.ANY_STAFF),
  controller.getAlert
);

/**
 * The log: what happened to an alert, in order, and who did it.
 *
 * Readable by every staff role, like the alerts themselves — it is the same
 * information with its history kept. Nothing writes here through the API;
 * entries are appended by the actions that cause them.
 */
router.get(
  '/alerts/:id/events',
  authenticate,
  requireRole(requireRole.ANY_STAFF),
  controller.listAlertEvents
);

router.get(
  '/events',
  authenticate,
  requireRole(requireRole.ANY_STAFF),
  validateQuery(eventQuerySchema),
  controller.listEvents
);

router.post(
  '/alerts/:id/acknowledge',
  authenticate,
  requireRole(requireRole.TRIP_EDITORS),
  controller.acknowledgeAlert
);

router.post(
  '/alerts/:id/resolve',
  authenticate,
  requireRole(requireRole.TRIP_EDITORS),
  validateBody(resolveSchema),
  controller.resolveAlert
);

/** Hand this alert to a specific trip editor — `userId: null` unassigns. */
router.post(
  '/alerts/:id/assign',
  authenticate,
  requireRole(requireRole.TRIP_EDITORS),
  validateBody(assignSchema),
  controller.assignAlert
);

/**
 * Where a party was last seen. Trip editors only — this is live location data
 * about identified people, and reconciliation has no use for it.
 */
router.get(
  '/bookings/:bookingId/locations',
  authenticate,
  requireRole(requireRole.TRIP_EDITORS),
  controller.partyLocations
);

module.exports = router;
