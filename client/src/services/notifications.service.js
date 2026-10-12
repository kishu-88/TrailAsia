import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/** The bell. Everything here is scoped to the signed-in user by the server. */

export function listNotifications(params = {}) {
  return api.get(`/notifications${toQuery(params)}`);
}

export function getUnreadCount() {
  return api.get('/notifications/unread-count').then((response) => response.data);
}

export function markNotificationRead(id) {
  return api.post(`/notifications/${id}/read`).then((response) => response.data.notification);
}

export function markAllNotificationsRead() {
  return api.post('/notifications/read-all').then((response) => response.data);
}
