import { formatDate } from '../../utils/format.js';

/** Shared vocabulary for the task screens, so the queue and the drawer agree. */

export const TASK_STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const TASK_CATEGORY_LABELS = {
  documents: 'Documents',
  payment: 'Payment',
  operator: 'Ground operator',
  itinerary: 'Itinerary',
  admin: 'Admin',
  other: 'Other',
};

export const TASK_PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export function taskStatusTone(status) {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'blocked':
      return 'warning';
    case 'done':
      return 'success';
    case 'cancelled':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function taskPriorityTone(priority) {
  switch (priority) {
    case 'urgent':
      return 'danger';
    case 'high':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * How a due date reads to somebody scanning the queue.
 *
 * "in 9 days" is the useful form, not the date — the question the screen answers
 * is how much time is left, and a reader should not have to subtract.
 *
 * A closed task gets the plain date instead, and `relative: false` with it. A
 * countdown to a deadline that no longer applies is noise, and callers showing
 * the date already use the parenthetical for the countdown.
 */
export function dueLabel(task) {
  if (!task.dueOn) return { text: 'No date', tone: 'muted', relative: false };

  const days = task.daysUntilDue;
  if (!task.isOpen || days === null || days === undefined) {
    return { text: formatDate(task.dueOn), tone: 'muted', relative: false };
  }
  if (days < 0) {
    const late = Math.abs(days);
    return { text: `${late} day${late === 1 ? '' : 's'} late`, tone: 'danger', relative: true };
  }
  if (days === 0) return { text: 'Due today', tone: 'danger', relative: true };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning', relative: true };
  if (days <= 7) return { text: `in ${days} days`, tone: 'warning', relative: true };
  return { text: `in ${days} days`, tone: 'muted', relative: true };
}

/** What an event line says in the trail. */
export function describeEvent(event) {
  switch (event.type) {
    case 'created':
      return 'raised this task';
    case 'assigned':
      if (event.fromValue) return `reassigned it from ${event.fromValue} to ${event.toValue}`;
      // Somebody picking up an unassigned task is the common case, and
      // "X assigned it to X" is a silly way to write it down.
      if (event.actor && event.actor.fullName === event.toValue) return 'took this on';
      return `assigned it to ${event.toValue}`;
    case 'unassigned':
      return 'put it back in the unassigned queue';
    case 'status_changed':
      return `moved it from ${TASK_STATUS_LABELS[event.fromValue] || event.fromValue} to ${
        TASK_STATUS_LABELS[event.toValue] || event.toValue
      }`;
    case 'handover':
      return `handed it over from ${event.fromValue} to ${event.toValue}`;
    case 'edited':
      return 'edited the details';
    case 'note':
      return 'added a note';
    default:
      return event.type;
  }
}
