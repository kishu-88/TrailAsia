'use strict';

const safetyService = require('../services/safety.service');
const authService = require('../services/auth.service');
const env = require('../config/env');

/**
 * Scheduled housekeeping.
 *
 * Two jobs, both of them deletions, and that is the point: the platform's
 * privacy commitments are only real if something actually removes the data.
 *
 *   purgeLocations  — location pings for trips that ended more than
 *                     LOCATION_RETENTION_DAYS ago (Privacy Act 1988, APP 11).
 *   purgeTokens     — refresh tokens that expired a month ago and are now just
 *                     a list of who signed in from where.
 *
 * Not wired to a scheduler yet. Run it from cron or Task Scheduler:
 *
 *     node -e "require('./src/jobs/purgeLocations').run().then(console.log)"
 *
 * It is written as a plain function rather than bound to a particular scheduler
 * so that whichever one the agency ends up with, this file does not change.
 */
async function run({ now = new Date() } = {}) {
  const locations = await safetyService.purgeExpiredLocations({ now });
  const tokensDeleted = await authService.purgeExpiredTokens(30);

  return {
    ranAt: now.toISOString(),
    retentionDays: env.safety.locationRetentionDays,
    bookingsSwept: locations.bookings,
    pingsDeleted: locations.pingsDeleted,
    tokensDeleted,
  };
}

module.exports = { run };
