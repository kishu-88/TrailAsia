import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

export function listDestinations(params = {}) {
  return api.get(`/destinations${toQuery(params)}`);
}

export function getDestination(id) {
  return api.get(`/destinations/${id}`).then((response) => response.data.destination);
}

export function createDestination(payload) {
  return api.post('/destinations', payload).then((response) => response.data.destination);
}

export function updateDestination(id, changes) {
  return api.patch(`/destinations/${id}`, changes).then((response) => response.data.destination);
}

export function deactivateDestination(id) {
  return api.delete(`/destinations/${id}`).then((response) => response.data.destination);
}

export function reactivateDestination(id) {
  return api.post(`/destinations/${id}/reactivate`).then((response) => response.data.destination);
}

// --- Document requirements -------------------------------------------------

export function listRequirements(destinationId, { includeInactive = false } = {}) {
  return api.get(
    `/destinations/${destinationId}/document-requirements${
      includeInactive ? '?includeInactive=true' : ''
    }`
  );
}

export function addRequirement(destinationId, payload) {
  return api
    .post(`/destinations/${destinationId}/document-requirements`, payload)
    .then((response) => response.data.requirement);
}

export function updateRequirement(destinationId, requirementId, changes) {
  return api
    .patch(`/destinations/${destinationId}/document-requirements/${requirementId}`, changes)
    .then((response) => response.data.requirement);
}

export function deleteRequirement(destinationId, requirementId) {
  return api.delete(`/destinations/${destinationId}/document-requirements/${requirementId}`);
}
