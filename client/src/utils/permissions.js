/**
 * Role checks, mirroring `server/src/middleware/requireRole.js`.
 *
 * These decide what the interface *offers* — which buttons render, which nav
 * items appear. They are a courtesy to the user, not a security control. The
 * server checks every request independently, and it is the only thing standing
 * between a role and an action. Anyone can edit these values in their browser;
 * doing so gets them a 403, not access.
 *
 * If a rule changes here, change it there too — and the server first.
 */

const TRIP_EDITORS = ['consultant', 'coordinator', 'admin'];
const REFERENCE_EDITORS = ['coordinator', 'admin'];
const PASSPORT_VIEWERS = ['consultant', 'coordinator', 'admin'];
const MONEY_RECORDERS = ['finance', 'admin'];
const SCHEDULE_EDITORS = ['consultant', 'coordinator', 'finance', 'admin'];

function roleOf(user) {
  return user?.role ?? null;
}

export const can = {
  /** Create and edit bookings, itineraries and traveller records. */
  editTrips: (user) => TRIP_EDITORS.includes(roleOf(user)),

  /** Maintain destinations and their document requirements. */
  editReference: (user) => REFERENCE_EDITORS.includes(roleOf(user)),

  /**
   * Verify a traveller's documents. Deliberately narrower than editTrips: the
   * consultant who records an insurance policy should not be the one attesting
   * that it is genuine.
   */
  verifyDocuments: (user) => REFERENCE_EDITORS.includes(roleOf(user)),

  /** Manage staff accounts. */
  manageStaff: (user) => roleOf(user) === 'admin',

  /** See every email send attempt — operational detail, admin-only. */
  viewEmailLogs: (user) => roleOf(user) === 'admin',

  /** See an unmasked passport number. Finance has no need for one. */
  seePassport: (user) => PASSPORT_VIEWERS.includes(roleOf(user)),

  /**
   * Write to the ledger, and write money off.
   *
   * Excludes the consultant on purpose. The person whose sale it is must not be
   * the person who records that it was paid — hiding the button is a courtesy
   * to them, not the control; the server is the control.
   */
  recordPayments: (user) => MONEY_RECORDERS.includes(roleOf(user)),

  /** Set the instalment plan. Agreed while the trip is being sold. */
  planPayments: (user) => SCHEDULE_EDITORS.includes(roleOf(user)),
};

export { TRIP_EDITORS, REFERENCE_EDITORS, MONEY_RECORDERS, SCHEDULE_EDITORS };
