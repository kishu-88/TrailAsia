'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const env = require('../config/env');
const { loginSchema, validateBody } = require('../validators/auth.validators');
const { changePasswordSchema } = require('../validators/user.validators');

const router = express.Router();

/**
 * Coarse per-IP throttle on sign-in attempts. The per-account lockout in
 * auth.service.js is the real protection; this stops one host hammering the
 * endpoint across many accounts.
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

router.post('/login', loginLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

module.exports = router;
