import { api } from './apiClient.js';

/** Staff accounts. Administrator-only on the server; the UI hides the nav item. */

export function listUsers(params = {}) {
  return api.get(`/users${toQuery(params)}`);
}

export function getUser(id) {
  return api.get(`/users/${id}`).then((response) => response.data.user);
}

export function createUser(payload) {
  return api.post('/users', payload).then((response) => response.data.user);
}

export function updateUser(id, changes) {
  return api.patch(`/users/${id}`, changes).then((response) => response.data.user);
}

export function deactivateUser(id) {
  return api.delete(`/users/${id}`).then((response) => response.data.user);
}

export function reactivateUser(id) {
  return api.post(`/users/${id}/reactivate`).then((response) => response.data.user);
}

export function unlockUser(id) {
  return api.post(`/users/${id}/unlock`).then((response) => response.data.user);
}

export function resetUserPassword(id, password) {
  return api.post(`/users/${id}/password`, { password });
}

/** Drops empty values so the URL only carries filters that are actually set. */
export function toQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
