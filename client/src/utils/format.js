/** Display formatting. Nothing here changes data — it only decides how it reads. */

export const EM_DASH = '—';

/**
 * Format a `YYYY-MM-DD` calendar date.
 *
 * Parsed field by field rather than with `new Date(string)`, which treats a bare
 * date as UTC midnight. In Sydney that happens to land on the right day, but for
 * anyone west of Greenwich it silently shows the day before — the classic
 * off-by-one that makes a departure date wrong for half the world.
 */
export function formatDate(value, options) {
  if (!value) return EM_DASH;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return EM_DASH;
  return new Date(year, month - 1, day).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/** Format a full timestamp in the agency's timezone. */
export function formatDateTime(value) {
  if (!value) return EM_DASH;
  return new Date(value).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

/**
 * Format an amount for display.
 *
 * The API sends money as a string to protect precision. Converting to a number
 * here is safe **because this value is only ever rendered** — it is never sent
 * back, compared, or used in arithmetic. Amounts always show with their currency
 * code; an unlabelled number in a multi-currency agency is a bug waiting to happen.
 */
export function formatMoney(amount, currencyCode = 'AUD') {
  if (amount === null || amount === undefined || amount === '') return EM_DASH;
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'code',
    }).format(value);
  } catch {
    // An unrecognised currency code should not blank out the amount.
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

/** Days between today and a date, negative when the date has passed. */
export function daysUntil(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** "in 12 days", "today", "3 days ago" */
export function relativeDays(value) {
  const days = daysUntil(value);
  if (days === null) return EM_DASH;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** snake_case and machine values into something readable. */
export function humanise(value) {
  if (!value) return EM_DASH;
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ROLE_LABELS = {
  consultant: 'Travel consultant',
  coordinator: 'Tour coordinator',
  finance: 'Finance & administration',
  admin: 'Administrator',
};

export const BOOKING_STATUS_LABELS = {
  enquiry: 'Enquiry',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const DOCUMENT_TYPE_LABELS = {
  passport: 'Passport',
  visa: 'Visa',
  insurance: 'Insurance',
  health_declaration: 'Health declaration',
  permit: 'Permit',
  vaccination: 'Vaccination',
  other: 'Other',
};

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);

/** Maps a status to the badge tone defined in global.css. */
export function bookingStatusTone(status) {
  switch (status) {
    case 'confirmed':
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'quoted':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function documentStatusTone(status) {
  switch (status) {
    case 'verified':
    case 'on_file':
      return 'success';
    case 'submitted':
      return 'info';
    case 'rejected':
    case 'expired':
      return 'danger';
    case 'missing':
      return 'warning';
    default:
      return 'neutral';
  }
}
