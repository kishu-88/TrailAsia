'use strict';

/**
 * Money.
 *
 * Two jobs live here. The first is presentational: normalising what a driver
 * hands back so the API's contract does not depend on which database is
 * underneath. The second is arithmetic, and it is the reason this file exists
 * at all — a balance computed with `+` on JavaScript numbers is wrong, quietly,
 * and the reconciliation screen is precisely where that would not be noticed.
 *
 *   0.1 + 0.2                  // 0.30000000000000004
 *   addDecimal('0.10', '0.20') // '0.30'
 *
 * Every function below works on BigInt integers scaled by a power of ten —
 * cents for amounts, eight places for exchange rates — so no value is ever put
 * through a float on its way to or from the database.
 */

const CENTS = 2n;
const RATE_PLACES = 8n;

// --- Presentation ----------------------------------------------------------

/**
 * Normalise a DECIMAL column to a fixed two-place string.
 *
 * Drivers disagree about DECIMAL: mysql2 hands back a string (to preserve
 * precision), while sqlite3 hands back a JavaScript number. Left alone, the API
 * would return "8450.50" in production and 8450.5 in tests — the sort of
 * difference that is invisible until a client does string comparison on a total.
 *
 * The conversion is done textually wherever possible so a value that arrived as
 * a string is never put through a float on its way out.
 */
function toDecimalString(value) {
  if (value === null || value === undefined || value === '') return null;

  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text; // leave anything unexpected alone

  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const cents = `${fraction}00`.slice(0, 2);

  return `${negative ? '-' : ''}${whole}.${cents}`;
}

/**
 * A Sequelize attribute getter for a DECIMAL field.
 *
 *   totalAmount: { type: DataTypes.DECIMAL(12, 2), get: decimalGetter('totalAmount') }
 */
function decimalGetter(field) {
  return function get() {
    return toDecimalString(this.getDataValue(field));
  };
}

/** Same, for a rate column, which carries eight places rather than two. */
function rateGetter(field) {
  return function get() {
    return toRateString(this.getDataValue(field));
  };
}

function toRateString(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  return scaledToString(parseScaled(text, RATE_PLACES), RATE_PLACES);
}

// --- Exact arithmetic ------------------------------------------------------

/**
 * Read a decimal string into a BigInt scaled by 10^places.
 *
 * Digits past `places` are truncated rather than rounded, deliberately: this is
 * the parse step, and an input with more precision than the column can hold is
 * a caller bug we would rather surface as an exact mismatch than silently round
 * into something that looks right. Rounding belongs in `multiplyDecimal`, where
 * it is unavoidable and explicit.
 */
function parseScaled(value, places) {
  if (value === null || value === undefined || value === '') return null;

  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new TypeError(`Not a decimal value: ${text}`);
  }

  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const padded = `${fraction}${'0'.repeat(Number(places))}`.slice(0, Number(places));

  const magnitude = BigInt(`${whole}${padded}`);
  return negative ? -magnitude : magnitude;
}

/** The inverse: a BigInt scaled by 10^places back to a plain decimal string. */
function scaledToString(scaled, places) {
  if (scaled === null || scaled === undefined) return null;

  const count = Number(places);
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(count + 1, '0');

  const whole = digits.slice(0, digits.length - count);
  const fraction = count > 0 ? `.${digits.slice(digits.length - count)}` : '';

  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/** An amount as an exact number of cents. Null in, null out. */
function toCents(value) {
  return parseScaled(value, CENTS);
}

/** Cents back to a two-place string. */
function fromCents(cents) {
  return scaledToString(cents, CENTS);
}

function addDecimal(a, b) {
  return fromCents((toCents(a) ?? 0n) + (toCents(b) ?? 0n));
}

function subtractDecimal(a, b) {
  return fromCents((toCents(a) ?? 0n) - (toCents(b) ?? 0n));
}

/** Sum a list, skipping nulls. An empty list is '0.00', not null. */
function sumDecimals(values = []) {
  let total = 0n;
  for (const value of values) total += toCents(value) ?? 0n;
  return fromCents(total);
}

/**
 * Convert an amount at a recorded exchange rate.
 *
 * Rounded half away from zero to the nearest cent — the convention banks and
 * accounting systems use, and the one a traveller checking the arithmetic on
 * their invoice will expect. Half-to-even would be defensible too; what is not
 * defensible is leaving it to the floating point unit and getting a different
 * answer depending on the values.
 *
 * The rate is always stored alongside the result, never recomputed later: rates
 * move, and a converted figure that changes when you look at it again is not a
 * record of anything.
 */
function multiplyDecimal(amount, rate) {
  const cents = toCents(amount);
  if (cents === null) return null;

  const scaledRate = parseScaled(rate ?? '1', RATE_PLACES);
  if (scaledRate === null) return fromCents(cents);

  const product = cents * scaledRate; // scale 2 + 8 = 10
  const divisor = 10n ** RATE_PLACES;

  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  // +half before the integer division is round-half-up on the magnitude, which
  // with the sign reapplied is round-half-away-from-zero.
  const rounded = (magnitude + divisor / 2n) / divisor;

  return fromCents(negative ? -rounded : rounded);
}

/** -1, 0 or 1, comparing exactly. Null sorts as zero. */
function compareDecimal(a, b) {
  const left = toCents(a) ?? 0n;
  const right = toCents(b) ?? 0n;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isPositive(value) {
  return (toCents(value) ?? 0n) > 0n;
}

function isZero(value) {
  return (toCents(value) ?? 0n) === 0n;
}

/** Never below zero — for "what is still owed", which cannot be negative. */
function clampAtZero(value) {
  const cents = toCents(value) ?? 0n;
  return fromCents(cents < 0n ? 0n : cents);
}

module.exports = {
  toDecimalString,
  decimalGetter,
  rateGetter,
  toRateString,

  toCents,
  fromCents,
  addDecimal,
  subtractDecimal,
  sumDecimals,
  multiplyDecimal,
  compareDecimal,
  isPositive,
  isZero,
  clampAtZero,
};
