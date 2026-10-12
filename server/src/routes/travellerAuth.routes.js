'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/travellerAuth.controller');
const authenticateTraveller = require('../middleware/authenticateTraveller');
const env = require('../config/env');
const { validateBody } = require('../validators/common');
const {
  travellerLoginSchema,
  activateSchema,
  changePasswordSchema,
} = require('../validators/travellerAuth.validators');

const router = express.Router();

/**
 * Per-IP throttle, as on the staff login. Travellers on a trek often share one
 * lodge connection, so the window is the same but the ceiling is the per-account
 * lockout in the service, not this.
 */
const loginLimiter = rateLimit({
  windowMs: env.auth.loginRateLimitWindowMinutes * 60 * 1000,
  limit: env.auth.loginRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many sign-in attempts. Try again shortly.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
});

router.post('/activate', loginLimiter, validateBody(activateSchema), controller.activate);
router.post('/login', loginLimiter, validateBody(travellerLoginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticateTraveller, controller.me);
router.post(
  '/change-password',
  authenticateTraveller,
  validateBody(changePasswordSchema),
  controller.changePassword
);

module.exports = router;
