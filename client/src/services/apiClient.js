/**
 * Single HTTP entry point for the whole app.
 *
 * Three things live here and nowhere else:
 *
 *  1. The access tokens. They are held in module variables — in memory only,
 *     never in localStorage — so a script injected into the page cannot read
 *     one off disk. They are lost on refresh, which is fine: the httpOnly
 *     refresh cookie re-establishes the session on boot.
 *
 *  2. Automatic refresh. When a request comes back 401 with
 *     ACCESS_TOKEN_EXPIRED, the client refreshes once and replays the request.
 *     Concurrent 401s share a single refresh promise rather than stampeding
 *     the endpoint.
 *
 *  3. Which session a request belongs to. There are two — staff and traveller —
 *     and they are kept in separate slots rather than one "current token".
 *     A consultant checking the traveller app in the same browser holds both at
 *     once, and a single slot would mean whichever they used last silently
 *     signed them out of the other. Each slot refreshes against its own
 *     endpoint and its own cookie.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const SESSIONS = {
  staff: { token: null, refreshPath: '/auth/refresh', promise: null, onExpired: () => {} },
  traveller: {
    token: null,
    refreshPath: '/auth/traveller/refresh',
    promise: null,
    onExpired: () => {},
  },
  operator: {
    token: null,
    refreshPath: '/auth/operator/refresh',
    promise: null,
    onExpired: () => {},
  },
};

function slot(scope = 'staff') {
  const session = SESSIONS[scope];
  if (!session) throw new Error(`Unknown session scope: ${scope}`);
  return session;
}

export function setAccessToken(token, scope = 'staff') {
  slot(scope).token = token || null;
}

export function getAccessToken(scope = 'staff') {
  return slot(scope).token;
}

/** Registered by the auth contexts so a dead session can clear app state. */
export function setSessionExpiredHandler(handler, scope = 'staff') {
  slot(scope).onExpired = typeof handler === 'function' ? handler : () => {};
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

async function rawRequest(
  path,
  { method = 'GET', body, headers = {}, auth = true, scope = 'staff' } = {}
) {
  const token = slot(scope).token;

  // A file upload arrives here as FormData. It is passed through untouched and
  // given no Content-Type: the browser has to write that header itself, because
  // only it knows the multipart boundary it is about to use.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    // Always send cookies; the server scopes each refresh cookie to its own path.
    credentials: 'include',
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
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

  // The whole envelope is returned — `{ data }` for a single resource,
  // `{ data, meta }` for a collection. Unwrapping to `.data` here would be
  // friendlier at the call site but would silently drop `meta`, and a list
  // screen that quietly loses its pagination looks like an empty database.
  // Services in this folder do the unwrapping, since they are the layer whose
  // job is knowing the API's shape.
  return payload;
}

/** Ask the server for a fresh access token. At most one in flight per session. */
export function refreshSession(scope = 'staff') {
  const session = slot(scope);
  if (!session.promise) {
    session.promise = rawRequest(session.refreshPath, {
      method: 'POST',
      auth: false,
      scope,
    })
      .then((payload) => {
        setAccessToken(payload.data.accessToken, scope);
        return payload.data;
      })
      .finally(() => {
        session.promise = null;
      });
  }
  return session.promise;
}

export async function request(path, options = {}) {
  const scope = options.scope || 'staff';
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
      await refreshSession(scope);
    } catch (refreshError) {
      setAccessToken(null, scope);
      slot(scope).onExpired();
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

/** The same verbs, bound to the traveller session. Saves repeating `{ scope }`. */
export const travellerApi = {
  get: (path, options) => api.get(path, { ...options, scope: 'traveller' }),
  post: (path, body, options) => api.post(path, body, { ...options, scope: 'traveller' }),
  patch: (path, body, options) => api.patch(path, body, { ...options, scope: 'traveller' }),
  delete: (path, options) => api.delete(path, { ...options, scope: 'traveller' }),
};

/** The same verbs, bound to the operator session. */
export const operatorApi = {
  get: (path, options) => api.get(path, { ...options, scope: 'operator' }),
  post: (path, body, options) => api.post(path, body, { ...options, scope: 'operator' }),
  patch: (path, body, options) => api.patch(path, body, { ...options, scope: 'operator' }),
  delete: (path, options) => api.delete(path, { ...options, scope: 'operator' }),
};
