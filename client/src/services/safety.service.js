import { api, travellerApi } from './apiClient.js';
import { toQuery } from './users.service.js';

// --- Traveller session -----------------------------------------------------

export async function getSafetySummary(bookingId) {
  const { data } = await travellerApi.get(`/safety/me?bookingId=${bookingId}`);
  return data;
}

export async function setLocationConsent(bookingId, granted) {
  const { data } = await travellerApi.post('/safety/me/consent', { bookingId, granted });
  return data;
}

export async function sendPing(bookingId, position) {
  const { data } = await travellerApi.post('/safety/me/pings', { bookingId, ...position });
  return data;
}

export async function raiseSos(bookingId, payload = {}) {
  const { data } = await travellerApi.post('/safety/me/sos', { bookingId, ...payload });
  return data;
}

export async function cancelSos(alertId) {
  const { data } = await travellerApi.post(`/safety/me/sos/${alertId}/cancel`);
  return data;
}

// --- Staff session ---------------------------------------------------------

export async function listAlerts({ status = 'open' } = {}) {
  const query = status ? `?status=${status}` : '';
  const { data } = await api.get(`/safety/alerts${query}`);
  return data;
}

export async function acknowledgeAlert(alertId) {
  const { data } = await api.post(`/safety/alerts/${alertId}/acknowledge`);
  return data;
}

/** Hand this alert to a specific trip editor. Pass `null` to unassign. */
export async function assignAlert(alertId, userId) {
  const { data } = await api.post(`/safety/alerts/${alertId}/assign`, { userId });
  return data;
}

export async function resolveAlert(alertId, notes) {
  const { data } = await api.post(`/safety/alerts/${alertId}/resolve`, { notes });
  return data;
}

/** One alert's history, oldest first. */
export async function listAlertEvents(alertId) {
  const { data } = await api.get(`/safety/alerts/${alertId}/events`);
  return data;
}

/** Every SOS event across every alert, newest first. Returns `{ data, meta }`. */
export function listSosEvents(params = {}) {
  return api.get(`/safety/events${toQuery(params)}`);
}

export async function getPartyLocations(bookingId) {
  const { data } = await api.get(`/safety/bookings/${bookingId}/locations`);
  return data;
}

// --- Portal access (staff acting on a traveller record) --------------------

export async function issuePortalInvite(travellerId) {
  const { data } = await api.post(`/travellers/${travellerId}/portal-invite`);
  return data;
}

export async function revokePortalAccess(travellerId) {
  const { data } = await api.delete(`/travellers/${travellerId}/portal-access`);
  return data.traveller;
}
