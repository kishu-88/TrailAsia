'use strict';

const paymentService = require('../services/payment.service');

/**
 * The instalment chase, run daily alongside `taskReminders`.
 *
 * Two passes over live payment schedules, both reading the ledger through
 * `settle` — the same function the reconciliation screen uses — so a bell
 * never fires for an instalment the screen would already show as paid off:
 *
 *   - **due soon**: falls due within `PAYMENT_REMINDER_LEAD_DAYS` and is not
 *     yet settled.
 *   - **overdue**: past its date and still owed.
 *
 * Both notify the booking's consultant and coordinator plus everyone in
 * finance, and both dedupe on the instalment's current due date, so a plan
 * that is rescheduled and misses its new date too is treated as a new fact
 * rather than staying silent.
 *
 * Not wired to a scheduler. Run it from cron or Task Scheduler:
 *
 *     node -e "require('./src/jobs/paymentReminders').run().then(console.log)"
 */
async function run({ now = new Date() } = {}) {
  const dueSoon = await paymentService.remindUpcomingPayments({ now });
  const overdue = await paymentService.remindOverduePayments({ now });

  return {
    ranAt: now.toISOString(),
    dueSoonChecked: dueSoon.checked,
    dueSoonNotified: dueSoon.notified,
    overdueChecked: overdue.checked,
    overdueNotified: overdue.notified,
  };
}

module.exports = { run };
