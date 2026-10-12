'use strict';

const express = require('express');

const bookingController = require('../controllers/booking.controller');
const taskController = require('../controllers/task.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody } = require('../validators/common');
const {
  createBookingSchema,
  updateBookingSchema,
  cancelBookingSchema,
  addTravellerSchema,
  createSegmentSchema,
  updateSegmentSchema,
  reorderSegmentsSchema,
} = require('../validators/booking.validators');

const router = express.Router();

router.use(authenticate);

// Finance reads bookings for reconciliation but does not edit trip data.
const canEdit = requireRole(requireRole.TRIP_EDITORS);

router.get('/', bookingController.list);
router.post('/', canEdit, validateBody(createBookingSchema), bookingController.create);
router.get('/:id', bookingController.get);
router.patch('/:id', canEdit, validateBody(updateBookingSchema), bookingController.update);
router.post('/:id/cancel', canEdit, validateBody(cancelBookingSchema), bookingController.cancel);

router.post(
  '/:id/travellers',
  canEdit,
  validateBody(addTravellerSchema),
  bookingController.addTraveller
);
router.delete('/:id/travellers/:travellerId', canEdit, bookingController.removeTraveller);

router.get('/:id/itinerary', bookingController.listSegments);
router.post(
  '/:id/itinerary',
  canEdit,
  validateBody(createSegmentSchema),
  bookingController.addSegment
);
router.post(
  '/:id/itinerary/reorder',
  canEdit,
  validateBody(reorderSegmentsSchema),
  bookingController.reorderSegments
);
router.patch(
  '/:id/itinerary/:segmentId',
  canEdit,
  validateBody(updateSegmentSchema),
  bookingController.updateSegment
);
router.delete('/:id/itinerary/:segmentId', canEdit, bookingController.deleteSegment);

// Document readiness for the whole party, against every destination visited.
router.get('/:id/readiness', bookingController.readiness);

/**
 * Turn this booking's outstanding requirements into tasks, and close the ones
 * whose gap has been filled. Idempotent — safe to run every morning.
 *
 * Mounted here rather than under `/tasks` because it is an action on a booking:
 * the booking is the thing that has readiness, and the tasks are the output.
 */
router.post('/:bookingId/tasks/sync', canEdit, taskController.syncFromReadiness);

module.exports = router;
