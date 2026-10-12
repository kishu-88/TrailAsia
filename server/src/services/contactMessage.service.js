'use strict';

const { ContactMessage } = require('../models');
const notificationService = require('./notification.service');

/**
 * A message from the public site's general contact form.
 *
 * Unlike `bookingService.createPublicEnquiry`, this never touches
 * `Traveller` or `Booking` — a "do you take group bookings?" question isn't
 * a trip, and force-fitting it into the booking lifecycle just to get a
 * record would be the tail wagging the dog. It's its own row, and the
 * audience is the same trip-editor roles a booking enquiry reaches
 * (`TRIP_EDITOR_ROLES` — consultants, coordinators, admins), since a general
 * message could turn into any of their work.
 */
async function createPublic(payload) {
  const created = await ContactMessage.create(payload);

  await notificationService.contactMessageReceived(created);

  return created;
}

module.exports = { createPublic };
