'use strict';

const { z } = require('zod');

const { idLike, dateOnly } = require('./common');

/**
 * Deliberately loose compared to the staff booking form: this is a stranger
 * telling the agency they exist, not a consultant entering a confirmed
 * itinerary. Dates are approximate ("roughly March") and optional; a party
 * size and a destination are the only things that must be real.
 */
const createEnquirySchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.').max(100),
    lastName: z.string().trim().min(1, 'Last name is required.').max(100),
    email: z
      .string({ required_error: 'Email is required.' })
      .trim()
      .toLowerCase()
      .email('Enter a valid email address.'),
    phone: z.string().trim().max(40).nullish(),
    destinationId: idLike,
    // A traveller planning a multi-country trip ("Everest, then a few days in
    // Kathmandu") names the extra legs here. The lead destination above still
    // drives the booking's title and currency; these become additional
    // itinerary segments on the same enquiry. Capped at 4 — a fifth leg is a
    // conversation with a consultant, not a form field.
    additionalDestinationIds: z.array(idLike).max(4).default([]),
    departureDate: dateOnly.nullish(),
    returnDate: dateOnly.nullish(),
    partySize: z.number().int().min(1).max(50).default(1),
    message: z.string().trim().max(2000).nullish(),
  })
  .refine(
    (value) => !value.departureDate || !value.returnDate || value.returnDate >= value.departureDate,
    { message: 'Return date cannot be before the departure date.', path: ['returnDate'] }
  );

module.exports = { createEnquirySchema };
