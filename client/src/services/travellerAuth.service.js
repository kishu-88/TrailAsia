import { refreshSession, setAccessToken, travellerApi } from './apiClient.js';

/** Set a password from an invitation link and start a session. */
export async function activate(token, password) {
  const { data } = await travellerApi.post(
    '/auth/traveller/activate',
    { token, password },
    { auth: false }
  );
  setAccessToken(data.accessToken, 'traveller');
  return data;
}

export async function login(email, password) {
  const { data } = await travellerApi.post(
    '/auth/traveller/login',
    { email, password },
    { auth: false }
  );
  setAccessToken(data.accessToken, 'traveller');
  return data;
}

/**
 * Re-establish a session from the httpOnly refresh cookie. Called once on boot —
 * failing just means nobody is signed in, which is the normal case.
 */
export async function restoreSession() {
  return refreshSession('traveller');
}

export async function logout() {
  try {
    await travellerApi.post('/auth/traveller/logout', undefined, { auth: false });
  } finally {
    setAccessToken(null, 'traveller');
  }
}

export async function fetchMe() {
  const { data } = await travellerApi.get('/auth/traveller/me');
  return data;
}

export async function listTrips() {
  const { data } = await travellerApi.get('/me/trips');
  return data;
}

export async function getTrip(bookingId) {
  const { data } = await travellerApi.get(`/me/trips/${bookingId}`);
  return data;
}

/**
 * Send one of the traveller's own documents, with its file.
 *
 * Always lands as "submitted": a coordinator verifies it before it counts
 * towards the checklist. `fields` is the document's metadata (type, and
 * optionally destinationId, reference, expiresOn); blank values are left out
 * rather than sent as empty strings, which the API would reject as invalid.
 */
export async function uploadDocument(fields, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') form.append(key, value);
  }
  form.append('file', file);

  const { data } = await travellerApi.post('/me/documents', form);
  return data.document;
}
