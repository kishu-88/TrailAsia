'use strict';

const destinationService = require('../services/destination.service');
const bookingService = require('../services/booking.service');
const testimonialService = require('../services/testimonial.service');
const contactMessageService = require('../services/contactMessage.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- TrailAsia Book — the public site's only way into this API -------------
//
// No `authenticate` or `authenticateTraveller` anywhere on this router. That
// is the point: it is the surface a stranger with no account reaches. See
// destinationService.listPublic/getPublicById for the narrower shape that
// keeps it that way, and bookingService.createPublicEnquiry for how a
// submission becomes a normal `enquiry`-stage booking in the same pipeline
// staff already work from.

const listDestinations = handle(async (req, res) => {
  res.json(await destinationService.listPublic(req.query));
});

const getDestination = handle(async (req, res) => {
  const destination = await destinationService.getPublicById(req.params.id);
  res.json({ data: { destination } });
});

const listTestimonials = handle(async (req, res) => {
  res.json(await testimonialService.listPublic(req.query));
});

const createEnquiry = handle(async (req, res) => {
  const booking = await bookingService.createPublicEnquiry(req.body);
  // A slim, hand-built shape — not booking.toPublicJSON(), which is written
  // for a signed-in staff member and carries the consultant's name, internal
  // notes and money fields. The person who just submitted this form gets
  // back only what they gave, plus the reference to quote if they call.
  res.status(201).json({
    data: {
      enquiry: {
        reference: booking.reference,
        status: booking.status,
        title: booking.title,
        departureDate: booking.departureDate,
        returnDate: booking.returnDate,
        partySize: booking.partySize,
      },
    },
  });
});

const createContactMessage = handle(async (req, res) => {
  const message = await contactMessageService.createPublic(req.body);
  // Same reasoning as `createEnquiry`'s response: a slim, hand-built shape,
  // not `toPublicJSON()`'s full row (nobody needs their own message parroted
  // back at length) — just enough to confirm it was received.
  res.status(201).json({ data: { received: true, id: message.id } });
});

module.exports = {
  listDestinations,
  getDestination,
  listTestimonials,
  createEnquiry,
  createContactMessage,
};
