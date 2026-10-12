import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/**
 * Payments and reconciliation.
 *
 * Two resources behind one path. `/payments/schedules` is the plan — what the
 * traveller agreed to pay and when. `/payments` is the ledger — what actually
 * moved. Everything the screens show is those two read against each other, and
 * the arithmetic happens on the server so the figures cannot differ between
 * this client and anything else that talks to the API.
 */

// --- The plan --------------------------------------------------------------

export function listSchedules(params = {}) {
  return api.get(`/payments/schedules${toQuery(params)}`);
}

export function addSchedule(payload) {
  return api.post('/payments/schedules', payload).then((response) => response.data.schedule);
}

export function updateSchedule(id, changes) {
  return api
    .patch(`/payments/schedules/${id}`, changes)
    .then((response) => response.data.schedule);
}

/** Write an instalment off, or drop it from the plan. Finance only. */
export function closeSchedule(id, { status, reason }) {
  return api
    .post(`/payments/schedules/${id}/close`, { status, reason })
    .then((response) => response.data.schedule);
}

// --- The ledger ------------------------------------------------------------

export function listPayments(params = {}) {
  return api.get(`/payments${toQuery(params)}`);
}

export function recordPayment(payload) {
  return api.post('/payments', payload).then((response) => response.data.payment);
}

/** Corrects description only — never an amount. The API refuses the rest. */
export function updatePayment(id, changes) {
  return api.patch(`/payments/${id}`, changes).then((response) => response.data.payment);
}

/** Move a payment along: cleared, failed or refunded. */
export function settlePayment(id, { status, reason }) {
  return api
    .post(`/payments/${id}/settle`, { status, reason })
    .then((response) => response.data.payment);
}

// --- Views -----------------------------------------------------------------

/** Everything about one booking's money, in one read. */
export function getBookingSummary(bookingId) {
  return api
    .get(`/payments/bookings/${bookingId}/summary`)
    .then((response) => response.data);
}

/** The chase list: instalments still owed, soonest first. */
export function listOutstanding(params = {}) {
  return api.get(`/payments/outstanding${toQuery(params)}`);
}

export function getSummary() {
  return api.get('/payments/summary').then((response) => response.data);
}
