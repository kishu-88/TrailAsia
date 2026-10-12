'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/public.controller');
const env = require('../config/env');
const { validateBody } = require('../validators/common');
const { createEnquirySchema } = require('../validators/publicEnquiry.validators');
const { createContactMessageSchema } = require('../validators/contactMessage.validators');

const router = express.Router();

/**
 * There is no per-account lockout to fall back on here — there is no
 * account — so this per-IP ceiling is the only brake on the enquiry form.
 * Reading destinations is not limited, for the same reason browsing a shop
 * window isn't.
 */
const enquiryLimiter = rateLimit({
  windowMs: env.publicEnquiry.rateLimitWindowMinutes * 60 * 1000,
  limit: env.publicEnquiry.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many enquiries submitted. Try again shortly.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
});

router.get('/destinations', controller.listDestinations);
router.get('/destinations/:id', controller.getDestination);
router.get('/testimonials', controller.listTestimonials);
router.post(
  '/booking-enquiries',
  enquiryLimiter,
  validateBody(createEnquirySchema),
  controller.createEnquiry
);
// Same per-IP ceiling as the enquiry form, same reasoning — no account to
// hang a per-account lockout off. A separate limiter instance, though, so
// filling in one form repeatedly doesn't eat into the other's budget.
const contactLimiter = rateLimit({
  windowMs: env.publicEnquiry.rateLimitWindowMinutes * 60 * 1000,
  limit: env.publicEnquiry.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many messages submitted. Try again shortly.',
      code: 'TOO_MANY_REQUESTS',
    },
  },
});
router.post(
  '/contact-messages',
  contactLimiter,
  validateBody(createContactMessageSchema),
  controller.createContactMessage
);

module.exports = router;
