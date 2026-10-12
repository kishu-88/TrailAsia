'use strict';

const safetyService = require('../services/safety.service');

/**
 * The SOS escalation sweep.
 *
 * Re-notifies every trip editor about any alert that has sat `raised`, with
 * nobody assigned to it, for longer than `SOS_ESCALATION_MINUTES` — and keeps
 * re-notifying every interval after that, not just once, until somebody
 * claims it (acknowledges, or is assigned).
 *
 * This is the one job in `jobs/` where the usual daily cadence is wrong.
 * `paymentReminders` and `taskReminders` run once a day because "due in a
 * week" and "overdue since yesterday" are daily facts. An unclaimed SOS is
 * not — five unanswered minutes matters here in a way five unanswered hours
 * never does for an instalment. Whatever schedules this (see `README.md`)
 * needs to run it every minute or close to it, which plain cron/Task
 * Scheduler can do but a daily job runner cannot; that scheduling choice is
 * infrastructure this phase didn't set up (same "deployment target" gap
 * noted since the very first phase doc).
 *
 * Not wired to a scheduler. Run it from cron or Task Scheduler:
 *
 *     node -e "require('./src/jobs/sosEscalation').run().then(console.log)"
 */
async function run({ now = new Date() } = {}) {
  const result = await safetyService.escalateStaleSos({ now });

  return {
    ranAt: now.toISOString(),
    unclaimedChecked: result.checked,
    escalated: result.escalated,
    peopleNotified: result.notified,
  };
}

module.exports = { run };
