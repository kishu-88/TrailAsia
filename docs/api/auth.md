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

## Traveller sessions

Base path: `/api/v1/auth/traveller`

Travellers sign in to see their own trip. They are not staff, get no row in
`users`, and their credential lives on their traveller record — so a person exists
in exactly one place and a login cannot drift away from the record it belongs to.

**Scope.** Every access token carries a `scope` claim, `staff` or `traveller`, and
the two use different JWT audiences. This is not decoration: `sub` is a primary key
and the two tables are numbered separately, so traveller 7 and user 7 both exist.
Without the claim, a traveller's token presented to a staff route would load the
staff account that happens to share its id. `authenticate` and `authenticateTraveller`
are separate middleware for the same reason — one function that accepted either and
branched would be a single `if` away from letting a traveller into the staff portal.

**Cookies.** The traveller refresh cookie has its own name
(`trailasia_rt_traveller`) and its own path (`/api/v1/auth/traveller`). The staff
cookie is scoped to `/api/v1/auth`, which includes these routes, so sharing a name
would mean whichever session was established last silently replaced the other.

Rotation, reuse detection and revoke-everything are the same code and the same
table as staff sessions — `refresh_tokens` gained a `subject_type` rather than being
copied. Those are the security-critical parts of the design and a second copy is how
one copy stops matching the other.

### `POST /travellers/:id/portal-invite` — staff

Roles: `consultant`, `coordinator`, `admin`. Issues a single-use invitation and
returns the plaintext token **once**; only its SHA-256 hash is stored.

```jsonc
{ "data": { "traveller": { "…": "…", "portal": { "state": "invited", "…": "…" } },
            "inviteToken": "9f3c…",
            "activationUrl": "http://localhost:5174/activate?token=9f3c…",
            "emailed": true,
            "expiresAt": "2026-09-17T06:00:00.000Z",
            "expiresInHours": 72,
            "delivery": "This link has been emailed to the traveller." } }
```

`activationUrl` is the one link for this invitation: the same address goes in the
email and in the dialog staff copy from. It points at TrailAsia Book's `/activate`
when `TRAVELLER_PORTAL_URL` is set, and at the staff client's `/trip/activate`
when it is not.

`emailed` is `true` only when the mail provider accepted the message. With no
provider configured, or when the send fails, it is `false`, `delivery` says so, and
the consultant passes the link on themselves. The invitation is issued either way.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `NO_EMAIL` | The traveller has no email address to sign in with |
| 400 | `TRAVELLER_INACTIVE` | The traveller record is deactivated |
| 400 | `PORTAL_ALREADY_ACTIVE` | They already have access — revoke it first |

### `DELETE /travellers/:id/portal-access` — staff

Withdraws access and revokes every live session in the same transaction. Access that
survives until a token expires is not revoked, it is delayed, and the delay is
usually the reason for revoking.

### `POST /auth/traveller/activate`

```json
{ "token": "9f3c…", "password": "at least twelve characters" }
```

`201` with a session. The invitation is burned on use. Same 12-character minimum as
staff — a traveller's account reaches their passport number and their medical notes;
it is not a lesser account.

`401 INVALID_INVITE` · `401 INVITE_EXPIRED` (default 72 hours, `PORTAL_INVITE_TTL_HOURS`).

### `POST /auth/traveller/login`

`{ "email": "…", "password": "…" }` → `200` with `traveller`, `accessToken`,
`expiresIn`, and a refresh cookie.

An unknown address is compared against a dummy hash and gets the same message and
the same timing as a wrong password. The reasoning is stronger here than for staff:
what an attacker learns from a fast "no such account" is whether a named person is
travelling, and where. Five failures lock the account for `LOCKOUT_MINUTES`.

`403 PORTAL_ACCESS_REVOKED` if access has been withdrawn.

### `POST /auth/traveller/refresh` · `POST /auth/traveller/logout`

As the staff equivalents, against the traveller cookie.

### `GET /auth/traveller/me`

The signed-in traveller plus the trips they are on. Their **own** passport number is
returned unmasked — it is their document, and a traveller filling in a visa form is
exactly who the masking was never meant to obstruct.

### `POST /auth/traveller/change-password`

`{ "currentPassword": "…", "newPassword": "…" }`. Revokes every other session and
re-issues this one, as the staff endpoint does.

### The traveller's own data — `/api/v1/me`

`GET /me/trips` · `GET /me/trips/:bookingId` · `GET /me/trips/:bookingId/payments` ·
`POST /me/documents`

A separate mount rather than extra roles on `/travellers/:id`. The staff routes take
an id from the URL and decide whether the caller may see it; these take the id from
the session and never read one from the request, so there is no id to tamper with.

The trip payload is built field by field rather than reusing the staff booking
shape. It carries the itinerary and the agency's contacts, and not the sell price,
the deposit, internal notes or anybody else's record — and the reason for building
it separately is not that those are secret, but that a shape which happens to be
safe today becomes unsafe the first time somebody adds a field to it for a staff
screen.

**`GET /me/trips/:bookingId/payments`** reuses `paymentService.listSchedules` —
the same read the finance screen uses, so "what's outstanding" cannot drift
between the two — but returns a slimmer shape: `label`, `dueOn`, `amount`,
`status`, `paid`, `outstanding`, `settled`, `overdue`. No `notes`, no
`createdBy`, no booking summary the caller already has.

**`POST /me/documents`** lets a traveller add one of their own documents from
the portal — a reference, an issuer, dates, and either an uploaded file or a
link to where it lives (`filePath`), or both, or neither. It always lands as
`status: "submitted"`; a traveller cannot self-verify. Raises
`document_submitted` (see `notifications.md`) to whoever created the
traveller record, the same recipient `document_verified` and
`document_rejected` use.

Sent as `multipart/form-data` with a `file` field to upload a real file
(PDF, JPEG, PNG or WebP, size capped by `UPLOAD_MAX_BYTES`), or as plain JSON
for metadata/a link only — `uploadDocument` middleware only parses the
request when its content type is actually multipart, so the one route
serves both. Files land on local disk (`fileStorage.service.js`, under
`UPLOAD_DIR`) named by a random id, never the traveller's own filename or
any other request data — nothing on disk reveals whose document it is by
being listed. **`GET /me/documents/:documentId/file`** downloads it back,
gated by "this document belongs to this traveller" the same way
`/me/trips/:id` is gated by booking membership.

The staff side (`POST`/`GET /travellers/:id/documents/:documentId/file`,
[`travellers.md`](travellers.md)) works the same way, one step removed:
staff create the document's metadata first (`POST
/travellers/:id/documents`), then attach a file to it. Attaching a file is a
substantive change, so it invalidates a prior verification exactly like
editing the reference or expiry does (see `travellers.md`).

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

Self-service password reset by email link, for staff and travellers alike, and MFA.
Traveller invitations are handed over by a consultant because there is no mail
transport yet. Role-based authorisation and administrator-managed accounts are built
— see [`users.md`](users.md) and the role table in [`README.md`](README.md).
