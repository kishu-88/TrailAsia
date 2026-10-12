/**
 * How an SOS event reads on screen. Shared by the per-alert history on the
 * safety desk and the SOS log, so the same event is never worded two ways.
 */

export const SOS_EVENT_LABEL = {
  raised: 'Raised',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  escalated: 'Escalated',
  resolved: 'Closed',
  cancelled: 'Withdrawn',
};

export const SOS_EVENT_TONE = {
  raised: 'danger',
  acknowledged: 'warning',
  assigned: 'info',
  unassigned: 'neutral',
  escalated: 'danger',
  resolved: 'success',
  cancelled: 'neutral',
};

const SOS_EVENT_VERB = {
  raised: 'raised the alert',
  acknowledged: 'acknowledged it',
  assigned: 'assigned it',
  unassigned: 'unassigned it',
  escalated: 'escalated it',
  resolved: 'closed it',
  cancelled: 'withdrew the alert',
};

/** Who did it. The platform has no name, and is not given one. */
export function sosActorName(event) {
  if (event.actor?.kind === 'system') return 'Automatically';
  return event.actor?.name || 'Unknown';
}

/** "Maya Gurung acknowledged it" / "Automatically escalated". */
export function sosEventSentence(event) {
  if (event.actor?.kind === 'system') return SOS_EVENT_LABEL[event.type]?.toLowerCase() || event.type;
  return SOS_EVENT_VERB[event.type] || event.type;
}
