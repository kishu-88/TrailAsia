'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/operatorAuth.controller');
const authenticateOperator = require('../middleware/authenticateOperator');
const env = require('../config/env');
const { validateBody } = require('../validators/common');
const {
  operatorLoginSchema,
  activateSchema,
  changePasswordSchema,
} = require('../validators/operatorAuth.validators');

const router = express.Router();

/** Same per-IP throttle as the staff and traveller logins. */
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
router.post('/login', loginLimiter, validateBody(operatorLoginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticateOperator, controller.me);
router.post(
  '/change-password',
  authenticateOperator,
  validateBody(changePasswordSchema),
  controller.changePassword
);

module.exports = router;
