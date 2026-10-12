'use strict';

const express = require('express');

const controller = require('../controllers/travellerPortal.controller');
const authenticateTraveller = require('../middleware/authenticateTraveller');
const uploadDocument = require('../middleware/uploadDocument');
const { validateBody } = require('../validators/common');
const { addOwnDocumentSchema } = require('../validators/travellerPortal.validators');

/**
 * The traveller's own data, under `/me`.
 *
 * A separate mount rather than extra roles on `/travellers/:id`. The staff
 * routes take an id from the URL and decide whether the caller may see it;
 * these take the id from the session and never read one from the request at
 * all, so there is no id to tamper with.
 */
const router = express.Router();

router.use(authenticateTraveller);

router.get('/trips', controller.listTrips);
router.get('/trips/:bookingId', controller.getTrip);
router.get('/trips/:bookingId/payments', controller.getTripPayments);
router.get('/documents', controller.listDocuments);
// `uploadDocument` only does anything for a multipart request (a plain JSON
// body — an external link, no file — passes straight through), so this one
// route serves both "add a link" and "add a link plus upload a file".
router.post(
  '/documents',
  uploadDocument,
  validateBody(addOwnDocumentSchema),
  controller.addDocument
);
router.get('/documents/:documentId/file', controller.downloadDocumentFile);

// Before `/notifications/:id/read`, or "unread-count" and "read-all" are read
// as ids — same ordering reason as the staff notification routes.
router.get('/notifications/unread-count', controller.notificationsUnreadCount);
router.post('/notifications/read-all', controller.markAllNotificationsRead);
router.get('/notifications', controller.listNotifications);
router.post('/notifications/:id/read', controller.markNotificationRead);

module.exports = router;
