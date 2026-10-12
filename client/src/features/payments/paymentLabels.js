/** Shared labels and badge tones for the payments module. */

export const PAYMENT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  cheque: 'Cheque',
  agent_credit: 'Agent credit',
  other: 'Other',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'Awaiting clearance',
  cleared: 'Cleared',
  failed: 'Failed',
  refunded: 'Refunded',
};

export const DIRECTION_LABELS = {
  incoming: 'From traveller',
  outgoing: 'To operator',
};

export const SCHEDULE_STATUS_LABELS = {
  scheduled: 'Scheduled',
  waived: 'Written off',
  cancelled: 'Removed',
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS);

export function paymentStatusTone(status) {
  switch (status) {
    case 'cleared':
      return 'success';
    case 'failed':
      return 'danger';
    case 'refunded':
      return 'warning';
    case 'pending':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * How an instalment reads at a glance.
 *
 * Takes the whole row rather than a status string, because "overdue" is not a
 * status — it is a date and a ledger read together. An instalment past its date
 * that has been paid is finished, and colouring it red would send somebody to
 * chase a traveller who owes nothing.
 */
export function scheduleTone(schedule) {
  if (!schedule) return 'neutral';
  if (schedule.status === 'waived') return 'warning';
  if (schedule.status === 'cancelled') return 'neutral';
  if (schedule.settled) return 'success';
  if (schedule.overdue) return 'danger';
  return 'info';
}

export function scheduleLabel(schedule) {
  if (!schedule) return '';
  if (schedule.status !== 'scheduled') {
    return SCHEDULE_STATUS_LABELS[schedule.status] || schedule.status;
  }
  if (schedule.settled) return 'Paid';
  if (schedule.overdue) return 'Overdue';
  if (schedule.paid && schedule.paid !== '0.00') return 'Part paid';
  return 'Due';
}
