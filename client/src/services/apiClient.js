/**
 * Single HTTP entry point for the whole app.
 *
 * Two things live here and nowhere else:
 *
 *  1. The access token. It is held in a module variable — in memory only, never
 *     in localStorage — so a script injected into the page cannot read it off
 *     disk. It is lost on refresh, which is fine: the httpOnly refresh cookie
 *     re-establishes the session on boot.
 *
 *  2. Automatic refresh. When a request comes back 401 with
 *     ACCESS_TOKEN_EXPIRED, the client refreshes once and replays the request.
 *     Concurrent 401s share a single refresh promise rather than stampeding
 *     the endpoint.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

/** Registered by AuthContext so a dead session can clear app state. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = typeof handler === 'function' ? handler : () => {};
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('The server sent an unreadable response.', {
      status: response.status,
    });
  }
}

async function rawRequest(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    // Always send the refresh cookie; the server scopes it to /auth anyway.
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(error.message || 'Request failed.', {
      status: response.status,
      code: error.code,
      details: error.details,
    });
  }

  return payload?.data ?? payload;
}

/** Ask the server for a fresh access token. At most one in flight at a time. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST', auth: false })
      .then((data) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    const expired =
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === 'ACCESS_TOKEN_EXPIRED' &&
      options.auth !== false &&
      !options._retried;

    if (!expired) throw error;

    try {
      await refreshSession();
    } catch (refreshError) {
      setAccessToken(null);
      onSessionExpired();
      throw refreshError;
    }

    return rawRequest(path, { ...options, _retried: true });
  }
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
