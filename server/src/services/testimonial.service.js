'use strict';

const { Testimonial, Destination } = require('../models');

/**
 * The public site's read of testimonials.
 *
 * Deliberately read-only from this side — a testimonial is entered by staff
 * (or, for now, seeded directly), never by a site visitor, so there is no
 * `create` here to keep the public surface narrow. `destinationId` narrows to
 * one destination's quotes; omitted, it returns the agency-wide set (mostly
 * quotes with no destination, for the homepage) mixed with everything else,
 * newest first.
 */
async function listPublic(query = {}) {
  const where = { isPublished: true };
  if (query.destinationId) where.destinationId = query.destinationId;

  const rows = await Testimonial.findAll({
    where,
    include: [{ model: Destination, as: 'destination', required: false }],
    order: [['createdAt', 'DESC']],
    limit: 24,
  });

  return { data: rows.map((row) => row.toPublicJSON()) };
}

module.exports = { listPublic };
