'use strict';

const express = require('express');

const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/authenticate');

/**
 * Your own notifications.
 *
 * No role checks. Every staff role has a bell, and what is in it was decided
 * when the notification was raised — the audience is chosen by the producer, not
 * filtered at read time. There is also no user id in any path here: the
 * recipient comes from the session, so there is nothing to tamper with.
 */
const router = express.Router();

router.use(authenticate);

// Before `/:id`, or "unread-count" and "read-all" are read as ids.
router.get('/unread-count', notificationController.unreadCount);
router.post('/read-all', notificationController.markAllRead);

router.get('/', notificationController.list);
router.post('/:id/read', notificationController.markRead);

module.exports = router;
