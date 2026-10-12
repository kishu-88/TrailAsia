'use strict';

const express = require('express');

const emailLogController = require('../controllers/emailLog.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Admin-only, same reasoning as /users: an email address and whatever error
// Mailgun returned is operational detail, not something every role needs to
// see to do their job.
router.use(authenticate, requireRole(requireRole.ADMIN_ONLY));

router.get('/', emailLogController.list);

module.exports = router;
