/** Shared labels and tones for the reporting module. */

/**
 * A month key (`2026-09`) as something readable.
 *
 * Parsed field by field rather than through `new Date('2026-09')`, which is
 * treated as UTC midnight and shows the previous month for anyone west of
 * Greenwich — the same off-by-one the date formatter avoids.
 */
export function formatMonth(value) {
  if (!value) return '—';
  const [year, month] = String(value).split('-').map(Number);
  if (!year || !month) return String(value);
  return new Date(year, month - 1, 1).toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * How a conversion or confirmation rate reads at a glance.
 *
 * Null is neutral, not bad. A consultant with one enquiry still in the pipeline
 * has no rate yet, and painting that red is how a report tells somebody they
 * are failing at something they have not finished doing.
 */
export function rateTone(rate) {
  if (rate === null || rate === undefined) return 'neutral';
  if (rate >= 60) return 'success';
  if (rate >= 35) return 'warning';
  return 'danger';
}

/** Ready / not ready, for the departure board's three columns. */
export function readyTone(ready) {
  return ready ? 'success' : 'warning';
}

export function formatRate(rate) {
  return rate === null || rate === undefined ? '—' : `${rate}%`;
}

/** "3 days late" — the phrasing the overdue lists use. */
export function daysLateLabel(days) {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'due today';
  return `${days} day${days === 1 ? '' : 's'} late`;
}
