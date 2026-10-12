import { refreshSession, setAccessToken, operatorApi } from './apiClient.js';

/** Set a password from an invitation link and start a session. */
export async function activate(token, password) {
  const { data } = await operatorApi.post(
    '/auth/operator/activate',
    { token, password },
    { auth: false }
  );
  setAccessToken(data.accessToken, 'operator');
  return data;
}

export async function login(email, password) {
  const { data } = await operatorApi.post(
    '/auth/operator/login',
    { email, password },
    { auth: false }
  );
  setAccessToken(data.accessToken, 'operator');
  return data;
}

/** Re-establish a session from the httpOnly refresh cookie. Called once on boot. */
export async function restoreSession() {
  return refreshSession('operator');
}

export async function logout() {
  try {
    await operatorApi.post('/auth/operator/logout', undefined, { auth: false });
  } finally {
    setAccessToken(null, 'operator');
  }
}

export async function fetchMe() {
  const { data } = await operatorApi.get('/auth/operator/me');
  return data;
}

export async function listConfirmations(params = {}) {
  const query = new URLSearchParams(params).toString();
  return operatorApi.get(`/operator/confirmations${query ? `?${query}` : ''}`);
}

export async function getConfirmation(id) {
  const { data } = await operatorApi.get(`/operator/confirmations/${id}`);
  return data.confirmation;
}

export async function respondToConfirmation(id, payload) {
  const { data } = await operatorApi.post(`/operator/confirmations/${id}/respond`, payload);
  return data.confirmation;
}

export async function listNotifications(params = {}) {
  const query = new URLSearchParams(params).toString();
  const { data } = await operatorApi.get(`/operator/notifications${query ? `?${query}` : ''}`);
  return data;
}

export async function getUnreadNotificationCount() {
  const { data } = await operatorApi.get('/operator/notifications/unread-count');
  return data;
}

export async function markNotificationRead(id) {
  const { data } = await operatorApi.post(`/operator/notifications/${id}/read`);
  return data.notification;
}

export async function markAllNotificationsRead() {
  const { data } = await operatorApi.post('/operator/notifications/read-all');
  return data;
}
