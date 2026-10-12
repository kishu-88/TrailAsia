'use strict';

const express = require('express');

const paymentController = require('../controllers/payment.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../validators/common');
const {
  createScheduleSchema,
  updateScheduleSchema,
  closeScheduleSchema,
  createPaymentSchema,
  updatePaymentSchema,
  settlePaymentSchema,
  listQuerySchema,
} = require('../validators/payment.validators');

const router = express.Router();

router.use(authenticate);

/**
 * Who does what — the duty separation of Section 8.2, as routes.
 *
 * **Everyone reads.** A consultant who cannot see whether their traveller has
 * paid will ring finance to ask, which is the phone call this module exists to
 * remove.
 *
 * **Consultants and coordinators set the plan.** The instalments are agreed
 * while the trip is being sold; requiring finance to key them would put a queue
 * between a quote and an acceptance.
 *
 * **Only finance and admin touch the ledger.** The person whose commission
 * depends on a booking looking paid must not be the person who records that it
 * was. This is the one control here aimed at a deliberate act rather than a
 * careless one, and it is why `MONEY_RECORDERS` excludes the consultant even
 * though they can see every figure on the screen.
 */
const canRead = requireRole(requireRole.ANY_STAFF);
const canPlan = requireRole(requireRole.SCHEDULE_EDITORS);
const canRecord = requireRole(requireRole.MONEY_RECORDERS);

// Fixed paths first, or "summary" and "outstanding" are parsed as payment ids.
router.get('/summary', canRead, paymentController.summary);
router.get(
  '/outstanding',
  canRead,
  validateQuery(listQuerySchema),
  paymentController.outstanding
);

// Everything about one booking's money, in one read.
router.get('/bookings/:bookingId/summary', canRead, paymentController.bookingSummary);

// --- The plan --------------------------------------------------------------

router.get(
  '/schedules',
  canRead,
  validateQuery(listQuerySchema),
  paymentController.listSchedules
);
router.post(
  '/schedules',
  canPlan,
  validateBody(createScheduleSchema),
  paymentController.addSchedule
);
router.get('/schedules/:scheduleId', canRead, paymentController.getSchedule);
router.patch(
  '/schedules/:scheduleId',
  canPlan,
  validateBody(updateScheduleSchema),
  paymentController.updateSchedule
);
// Waiving is writing off money a traveller owes, so it sits with finance rather
// than with whoever is editing the plan.
router.post(
  '/schedules/:scheduleId/close',
  canRecord,
  validateBody(closeScheduleSchema),
  paymentController.closeSchedule
);

// --- The ledger ------------------------------------------------------------

router.get('/', canRead, validateQuery(listQuerySchema), paymentController.listPayments);
router.post('/', canRecord, validateBody(createPaymentSchema), paymentController.recordPayment);

router.get('/:paymentId', canRead, paymentController.getPayment);
router.patch(
  '/:paymentId',
  canRecord,
  validateBody(updatePaymentSchema),
  paymentController.updatePayment
);
router.post(
  '/:paymentId/settle',
  canRecord,
  validateBody(settlePaymentSchema),
  paymentController.settlePayment
);

// Deliberately no DELETE. A ledger entry made in error is failed with a reason,
// never removed — the trail is what makes the separation above worth anything.

module.exports = router;
