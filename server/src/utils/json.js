'use strict';

/**
 * Defensively coerce a Sequelize JSON-array column's raw value into a real
 * array.
 *
 * In production this column has been coming back as a *string* holding JSON
 * text (e.g. `'["Everest Base Camp views","Sherpa-guided villages"]'`)
 * instead of the parsed array — the mysql2/Sequelize combination in this
 * project doesn't always auto-parse a native MySQL `JSON` column back into a
 * JS value on read, so callers were getting the raw column text. Nothing
 * wrong with what's stored; it just needs parsing on the way out. Left
 * unparsed, `destination.highlights.map(...)` throws
 * `highlights.map is not a function` and takes the whole page down (see the
 * September 2026 "blank destination page" incident).
 *
 * Handles being called on an already-correct array (no-op), a JSON string
 * (parsed), a small number of stacked encodings (parsed repeatedly, in case
 * something upstream ever does double-encode it), and anything else
 * (normalized to `[]` rather than left to crash a `.map()` downstream).
 */
function parseJsonArray(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (value == null) return value;
  if (typeof value === 'string' && depth < 5) {
    try {
      return parseJsonArray(JSON.parse(value), depth + 1);
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = { parseJsonArray };
