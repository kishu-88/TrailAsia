import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

export function listTravellers(params = {}) {
  return api.get(`/travellers${toQuery(params)}`);
}

export function getTraveller(id) {
  return api.get(`/travellers/${id}`).then((response) => response.data.traveller);
}

export function createTraveller(payload) {
  return api.post('/travellers', payload).then((response) => response.data.traveller);
}

export function updateTraveller(id, changes) {
  return api.patch(`/travellers/${id}`, changes).then((response) => response.data.traveller);
}

export function deactivateTraveller(id) {
  return api.delete(`/travellers/${id}`).then((response) => response.data.traveller);
}

export function reactivateTraveller(id) {
  return api.post(`/travellers/${id}/reactivate`).then((response) => response.data.traveller);
}

// --- Documents -------------------------------------------------------------

export function listDocuments(travellerId) {
  return api.get(`/travellers/${travellerId}/documents`);
}

export function addDocument(travellerId, payload) {
  return api
    .post(`/travellers/${travellerId}/documents`, payload)
    .then((response) => response.data.document);
}

export function updateDocument(travellerId, documentId, changes) {
  return api
    .patch(`/travellers/${travellerId}/documents/${documentId}`, changes)
    .then((response) => response.data.document);
}

export function verifyDocument(travellerId, documentId, { approved, notes }) {
  return api
    .post(`/travellers/${travellerId}/documents/${documentId}/verify`, { approved, notes })
    .then((response) => response.data.document);
}

export function deleteDocument(travellerId, documentId) {
  return api.delete(`/travellers/${travellerId}/documents/${documentId}`);
}

/** Hand a submitted document to a specific person to review — see task.service.js. */
export function assignDocumentReviewer(travellerId, documentId, { userId, bookingId, note }) {
  return api
    .post(`/travellers/${travellerId}/documents/${documentId}/assign-reviewer`, {
      userId,
      bookingId,
      note,
    })
    .then((response) => response.data.task);
}

/**
 * What this traveller still needs for a given set of destinations.
 * `destinationIds` is an array; the API takes it comma-separated.
 */
export function getChecklist(travellerId, { destinationIds, departureDate, returnDate, maxAltitudeMetres }) {
  return api.get(
    `/travellers/${travellerId}/document-checklist${toQuery({
      destinationIds: destinationIds.join(','),
      departureDate,
      returnDate,
      maxAltitudeMetres,
    })}`
  );
}
