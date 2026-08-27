import { api, refreshSession, setAccessToken } from './apiClient.js';

/** Sign in with email and password. Returns { user, accessToken, expiresIn }. */
export async function login(email, password) {
  const data = await api.post('/auth/login', { email, password }, { auth: false });
  setAccessToken(data.accessToken);
  return data;
}

/**
 * Re-establish a session from the httpOnly refresh cookie. Called once on app
 * boot — if it fails, nobody is signed in and that is a normal outcome.
 */
export async function restoreSession() {
  return refreshSession();
}

export async function logout() {
  try {
    await api.post('/auth/logout', undefined, { auth: false });
  } finally {
    setAccessToken(null);
  }
}

export async function fetchCurrentUser() {
  const data = await api.get('/auth/me');
  return data.user;
}
