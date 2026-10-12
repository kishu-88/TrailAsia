import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/** Ground operators: the directory, and per-booking confirmations. */

// --- Directory -------------------------------------------------------------

export function listOperators(params = {}) {
  return api.get(`/operators${toQuery(params)}`);
}

export function getOperator(id) {
  return api.get(`/operators/${id}`).then((response) => response.data.operator);
}

export function createOperator(payload) {
  return api.post('/operators', payload).then((response) => response.data.operator);
}

export function updateOperator(id, changes) {
  return api.patch(`/operators/${id}`, changes).then((response) => response.data.operator);
}

export function setVetting(id, { vetted, notes }) {
  return api
    .post(`/operators/${id}/vetting`, { vetted, notes })
    .then((response) => response.data.operator);
}

export function deactivateOperator(id) {
  return api.delete(`/operators/${id}`).then((response) => response.data.operator);
}

export function reactivateOperator(id) {
  return api.post(`/operators/${id}/reactivate`).then((response) => response.data.operator);
}

// --- Portal access (staff acting on an operator record) --------------------

export function issueOperatorPortalInvite(id) {
  return api.post(`/operators/${id}/portal-invite`).then((response) => response.data);
}

export function revokeOperatorPortalAccess(id) {
  return api.delete(`/operators/${id}/portal-access`).then((response) => response.data.operator);
}

// --- Confirmations ---------------------------------------------------------

export function listConfirmations(params = {}) {
  return api.get(`/operators/confirmations${toQuery(params)}`);
}

export function addConfirmation(payload) {
  return api
    .post('/operators/confirmations', payload)
    .then((response) => response.data.confirmation);
}

export function updateConfirmation(id, changes) {
  return api
    .patch(`/operators/confirmations/${id}`, changes)
    .then((response) => response.data.confirmation);
}

/** Mark that the request has actually gone out to the operator. */
export function markRequested(id) {
  return api
    .post(`/operators/confirmations/${id}/request`)
    .then((response) => response.data.confirmation);
}

export function respond(id, payload) {
  return api
    .post(`/operators/confirmations/${id}/respond`, payload)
    .then((response) => response.data.confirmation);
}

export function cancelConfirmation(id) {
  return api
    .delete(`/operators/confirmations/${id}`)
    .then((response) => response.data.confirmation);
}

// --- Views -----------------------------------------------------------------

/** Operator coverage for one booking — counterpart to document readiness. */
export function getBookingReadiness(bookingId) {
  return api
    .get(`/operators/bookings/${bookingId}/readiness`)
    .then((response) => response.data);
}

/** The chase list: everything still waiting on an answer, soonest first. */
export function listOutstanding(params = {}) {
  return api.get(`/operators/outstanding${toQuery(params)}`);
}

export function getSummary() {
  return api.get('/operators/summary').then((response) => response.data);
}
