/** Shared labels and badge tones for the operators module. */

export const OPERATOR_TYPE_LABELS = {
  guide: 'Guides',
  accommodation: 'Accommodation',
  transport: 'Transport',
  permits: 'Permits',
  equipment: 'Equipment',
  full_service: 'Full service',
  other: 'Other',
};

export const SERVICE_TYPE_LABELS = {
  guide: 'Guides',
  accommodation: 'Accommodation',
  transport: 'Transport',
  permits: 'Permits',
  equipment: 'Equipment',
  other: 'Other',
};

export const CONFIRMATION_STATUS_LABELS = {
  pending: 'Not yet sent',
  requested: 'Awaiting reply',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const OPERATOR_TYPES = Object.keys(OPERATOR_TYPE_LABELS);
export const SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS);

export function confirmationStatusTone(status) {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'declined':
      return 'danger';
    case 'requested':
      return 'info';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * How a partner's reliability reads at a glance.
 *
 * Null until they have answered something — an operator with no history should
 * look unproven, not bad. Treating "no data" as a failing score is how a new
 * partner never gets a first booking.
 */
export function reliabilityTone(rate) {
  if (rate === null || rate === undefined) return 'neutral';
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
}
