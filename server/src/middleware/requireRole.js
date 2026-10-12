'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Duty separation, as committed to in Section 8.2 of the business case.
 *
 * Roles, and what each is for:
 *
 *   consultant   — sells and plans. Bookings, itineraries, traveller records.
 *   coordinator  — runs departures. Everything a consultant can do, plus
 *                  destinations, document requirements and document verification.
 *   finance      — reads bookings and travellers for reconciliation; does not
 *                  edit trip data.
 *   admin        — everything, including staff accounts.
 *
 * Admin is not implicitly allowed everywhere: a route that lists admin
 * explicitly is a route we have thought about. `requireRole()` with no
 * arguments would deny everyone, which is a bug, so it throws at startup.
 */
function requireRole(...roles) {
  const allowed = roles.flat();

  if (allowed.length === 0) {
    throw new Error('requireRole() needs at least one role.');
  }

  return (req, _res, next) => {
    if (!req.user) {
      // authenticate must run first; reaching here means the route is misconfigured.
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (!allowed.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          'Your role does not have access to this action.',
          { code: 'INSUFFICIENT_ROLE', details: { required: allowed, actual: req.user.role } }
        )
      );
    }
    return next();
  };
}

/** Convenience groupings, so route files read as intent rather than lists. */
requireRole.ANY_STAFF = ['consultant', 'coordinator', 'finance', 'admin'];
requireRole.TRIP_EDITORS = ['consultant', 'coordinator', 'admin'];
requireRole.REFERENCE_EDITORS = ['coordinator', 'admin'];
requireRole.ADMIN_ONLY = ['admin'];

/**
 * Who may write to the ledger.
 *
 * Deliberately excludes the consultant who sold the trip. The person with a
 * commission interest in a booking looking paid must not also be the person who
 * records that it was — that separation is the point of Section 8.2, and it is
 * the one control here that stops a plausible fraud rather than a plausible
 * mistake. A consultant can still see every figure; they simply cannot enter one.
 */
requireRole.MONEY_RECORDERS = ['finance', 'admin'];

/**
 * Who may set the payment plan.
 *
 * The instalments are agreed while the trip is being sold, so the consultant
 * needs to write them, and finance needs to correct them. Everyone in this list
 * happens to be every staff role — but the reason is specific, and spelling it
 * out here means a future change to ANY_STAFF does not silently change who can
 * rewrite what a traveller owes.
 */
requireRole.SCHEDULE_EDITORS = ['consultant', 'coordinator', 'finance', 'admin'];

module.exports = requireRole;
