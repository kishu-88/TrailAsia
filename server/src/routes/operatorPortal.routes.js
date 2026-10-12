'use strict';

const express = require('express');

const controller = require('../controllers/operatorPortal.controller');
const authenticateOperator = require('../middleware/authenticateOperator');
const { validateBody } = require('../validators/common');
const { respondSchema } = require('../validators/operator.validators');

/**
 * The operator's own data, under `/operator` — parallel to `/me` for
 * travellers. The operator id comes from the session, never from the URL.
 */
const router = express.Router();

router.use(authenticateOperator);

router.get('/confirmations', controller.listConfirmations);
router.get('/confirmations/:confirmationId', controller.getConfirmation);
router.post(
  '/confirmations/:confirmationId/respond',
  validateBody(respondSchema),
  controller.respond
);

router.get('/notifications/unread-count', controller.notificationsUnreadCount);
router.post('/notifications/read-all', controller.markAllNotificationsRead);
router.get('/notifications', controller.listNotifications);
router.post('/notifications/:id/read', controller.markNotificationRead);

module.exports = router;
