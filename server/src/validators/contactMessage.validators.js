'use strict';

const { z } = require('zod');

/**
 * The public site's general contact form — deliberately looser than the
 * booking enquiry form (`publicEnquiry.validators.js`): no destination, no
 * dates, nothing trip-shaped, because not every message someone sends is
 * about a trip.
 */
const createContactMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(160),
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  phone: z.string().trim().max(40).nullish(),
  message: z.string().trim().min(1, 'Message is required.').max(4000),
});

module.exports = { createContactMessageSchema };
