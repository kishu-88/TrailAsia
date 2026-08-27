'use strict';

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

module.exports = { toDecimalString, decimalGetter };
