# Authentication API

Base path: `/api/v1/auth`

Every response uses the same envelope:

```jsonc
// success
{ "data": { ... } }

// failure
{ "error": { "message": "Human-readable.", "code": "MACHINE_READABLE", "details": { "field": "msg" } } }
```

`details` is only present on validation errors.

---

## How the session works

Two tokens, deliberately different in kind:

| | Access token | Refresh token |
| --- | --- | --- |
| Format | JWT | Opaque random string (96 hex chars) |
| Lifetime | 15 minutes (`JWT_EXPIRES_IN`) | 7 days (`REFRESH_TOKEN_TTL_DAYS`) |
| Sent as | `Authorization: Bearer <token>` | httpOnly cookie `trailasia_rt` |
| Stored by client | In memory only | Browser cookie jar; JavaScript cannot read it |
| Stored by server | Not stored — verified by signature | SHA-256 hash in `refresh_tokens` |

The access token is never written to `localStorage`, so an XSS bug cannot lift a
session off disk. The refresh token is `httpOnly`, so script on the page cannot read
it either. Losing the access token on page reload is fine — the client calls
`/auth/refresh` on boot and gets a new one from the cookie.

**Rotation.** Every call to `/auth/refresh` revokes the presented token and issues a
new one. If a token that has already been rotated away is presented again, that is
treated as evidence of theft: every session for that user is revoked and they must
sign in again.

---

## `POST /auth/login`

Public. Rate limited to 20 attempts per IP per 15 minutes.

**Request**

```json
{ "email": "kishor@himalayastravel.com.au", "password": "…" }
```

Email is trimmed and lowercased before lookup, so capitalisation never matters.

**Response `200`** — also sets the `trailasia_rt` cookie.

```json
{
  "data": {
    "user": {
      "id": "1",
      "firstName": "Kishor",
      "lastName": "Aryal",
      "fullName": "Kishor Aryal",
      "email": "kishor@himalayastravel.com.au",
      "role": "admin",
      "isActive": true,
      "lastLoginAt": "2026-08-27T03:14:00.000Z"
    },
    "accessToken": "eyJhbGciOi…",
    "expiresIn": 900
  }
}
```

**Errors**

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing or malformed email/password; `details` names the fields |
| 401 | `INVALID_CREDENTIALS` | Unknown email **or** wrong password — deliberately the same response, so the endpoint cannot be used to discover which addresses are registered |
| 403 | `ACCOUNT_LOCKED` | Too many failed attempts (`MAX_FAILED_LOGINS`, default 5); locked for `LOCKOUT_MINUTES` |
| 403 | `ACCOUNT_INACTIVE` | Account deactivated by an administrator |
| 429 | `TOO_MANY_REQUESTS` | Per-IP rate limit tripped |

The lockout is per **account**, not per IP — the account is the thing being
protected, and an attacker distributing attempts across hosts should not escape it.
The per-IP limit stops one host working through many accounts.

---

## `POST /auth/refresh`

Public — authenticated by the cookie, not by a bearer token. No request body.

**Response `200`** — same shape as login, and sets a new `trailasia_rt` cookie.

**Errors** (the cookie is cleared in every case)

| Status | `code` | When |
| --- | --- | --- |
| 401 | `NO_REFRESH_TOKEN` | No cookie sent |
| 401 | `INVALID_REFRESH_TOKEN` | Token not recognised |
| 401 | `REFRESH_TOKEN_EXPIRED` | Past its expiry |
| 401 | `REFRESH_TOKEN_REUSED` | Already rotated away — **all** sessions for that user are revoked |
| 403 | `ACCOUNT_INACTIVE` | Account deactivated since the token was issued |

---

## `POST /auth/logout`

Revokes the presented refresh token and clears the cookie. Returns `204` with no
body. Calling it without a valid cookie is a no-op that still returns `204` — a
logout should never fail.

---

## `GET /auth/me`

Requires `Authorization: Bearer <accessToken>`.

**Response `200`**

```json
{ "data": { "user": { "id": "1", "firstName": "Kishor", "…": "…" } } }
```

**Errors**

| Status | `code` | When |
| --- | --- | --- |
| 401 | `NO_ACCESS_TOKEN` | Missing or malformed `Authorization` header |
| 401 | `ACCESS_TOKEN_EXPIRED` | Expired — the client refreshes and retries automatically |
| 401 | `INVALID_ACCESS_TOKEN` | Bad signature, wrong issuer/audience, or wrong token type |
| 401 | `ACCOUNT_INACTIVE` | Account deactivated |

The user record is loaded from the database on every authenticated request rather
than trusted from the token claims alone. That costs one indexed primary-key lookup
and means deactivating an account takes effect immediately instead of whenever the
current access token happens to expire.

---

## `POST /auth/change-password`

Requires `Authorization: Bearer <accessToken>`.

```json
{ "currentPassword": "…", "newPassword": "at-least-twelve-characters" }
```

**Response `200`** — same shape as login, and sets a fresh `trailasia_rt` cookie.

Changing your password revokes **every other session** for the account. If the reason
for changing it was that the old one leaked, leaving other sessions alive defeats the
point. The session doing the change survives via the new cookie, so nobody is signed out
of the tab they are sitting in.

The current password is required, so someone who walks up to an unlocked laptop cannot
lock the real owner out. An administrator reset (`POST /users/:id/password`) deliberately
does not require it — see [`users.md`](users.md).

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | New password under 12 characters |
| 400 | `PASSWORD_UNCHANGED` | New password is the same as the current one |
| 401 | `INVALID_CURRENT_PASSWORD` | Current password wrong |

---

## Trying it with curl

```bash
# Sign in, keeping the cookie
curl -i -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@himalayastravel.com.au","password":"your-seed-password"}'

# Use the access token from the response
curl http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"

# Rotate
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/v1/auth/refresh

# End the session
curl -i -b cookies.txt -X POST http://localhost:4000/api/v1/auth/logout
```

---

## Not built yet

Self-service password reset by email link, and MFA. Role-based authorisation and
administrator-managed accounts are now built — see [`users.md`](users.md) and the role
table in [`README.md`](README.md).
