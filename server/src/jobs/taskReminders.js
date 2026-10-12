'use strict';

const notificationService = require('../services/notification.service');

/**
 * The daily nudge.
 *
 * Raises an in-app notification for every open task that is past its due date
 * and has an owner, and clears out read notifications that are months old.
 *
 * This runs on a schedule rather than being computed when somebody opens the
 * bell, and the distinction matters: a notification that only exists while you
 * are looking at it has not notified anybody. The dedupe key includes the due
 * date, so a task that is pushed out and goes late again is a new fact and gets
 * a new row — but a task sitting overdue for a fortnight produces one
 * notification, not fourteen.
 *
 * Not wired to a scheduler. Run it from cron or Task Scheduler:
 *
 *     node -e "require('./src/jobs/taskReminders').run().then(console.log)"
 */
async function run({ now = new Date() } = {}) {
  const overdue = await notificationService.notifyOverdueTasks({ now });
  const purged = await notificationService.purgeRead(60);

  return {
    ranAt: now.toISOString(),
    overdueTasksChecked: overdue.checked,
    peopleNotified: overdue.notified,
    readNotificationsPurged: purged,
  };
}

module.exports = { run };
