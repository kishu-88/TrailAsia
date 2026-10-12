'use strict';

const express = require('express');

const reportController = require('../controllers/report.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateQuery } = require('../validators/common');
const { reportQuerySchema } = require('../validators/report.validators');

const router = express.Router();

router.use(authenticate);

/**
 * Who sees which report.
 *
 * Every staff role reads both tabs. That is deliberate: the operational tab is
 * the agency's early-warning system, and a warning only some people can see is
 * not one.
 *
 * The one thing that varies by role is the consultant performance table. For a
 * consultant it is filtered to their own row — they see their own conversion
 * rate and nobody else's — and for a coordinator, finance or admin it is the
 * full comparison. That is handled in the service rather than here, because it
 * is a filter on the data and not a gate on the route; hiding the endpoint
 * would deny a consultant their own figures, which is the wrong trade.
 */
const canRead = requireRole(requireRole.ANY_STAFF);

router.get(
  '/commercial',
  canRead,
  validateQuery(reportQuerySchema),
  reportController.commercial
);

router.get(
  '/operational',
  canRead,
  validateQuery(reportQuerySchema),
  reportController.operational
);

// The dashboard's headline figures. Separate so the landing screen does not
// pay for the whole commercial tab to show four numbers.
router.get('/headline', canRead, validateQuery(reportQuerySchema), reportController.headline);

module.exports = router;
