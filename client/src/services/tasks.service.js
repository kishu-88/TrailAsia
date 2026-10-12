import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/** The shared work queue. */

export function listTasks(params = {}) {
  return api.get(`/tasks${toQuery(params)}`);
}

export function getTaskSummary() {
  return api.get('/tasks/summary').then((response) => response.data);
}

export function getTask(id) {
  return api.get(`/tasks/${id}`).then((response) => response.data.task);
}

export function createTask(payload) {
  return api.post('/tasks', payload).then((response) => response.data.task);
}

export function updateTask(id, changes) {
  return api.patch(`/tasks/${id}`, changes).then((response) => response.data.task);
}

/** `userId: null` releases the task back to the unassigned queue. */
export function assignTask(id, userId, note) {
  return api.post(`/tasks/${id}/assign`, { userId, note }).then((response) => response.data.task);
}

export function setTaskStatus(id, payload) {
  return api.post(`/tasks/${id}/status`, payload).then((response) => response.data.task);
}

export function addTaskNote(id, note) {
  return api.post(`/tasks/${id}/notes`, { note }).then((response) => response.data.task);
}

export function listTaskEvents(id) {
  return api.get(`/tasks/${id}/events`).then((response) => response.data);
}

/** Generate tasks from a booking's outstanding document requirements. Idempotent. */
export function syncTasksFromReadiness(bookingId) {
  return api.post(`/bookings/${bookingId}/tasks/sync`).then((response) => response.data);
}

export function getWorkload(userId) {
  return api.get(`/tasks/workload/${userId}`).then((response) => response.data);
}

export function handoverTasks(payload) {
  return api.post('/tasks/handover', payload).then((response) => response.data);
}
