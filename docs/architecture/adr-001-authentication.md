# ADR 001 — Authentication approach

- **Status:** Accepted
- **Date:** 2026-08-27
- **Applies to:** `server/src/{services,controllers,middleware}/auth*`, `client/src/context/AuthContext.jsx`

## Context

TrailAsia holds passport numbers, visa records, health declarations for high-altitude
trekking, payment history and — once the safety module ships — real-time traveller
location. Under the Privacy Act 1988 the health and location data are sensitive, and
Australian Privacy Principle 11 obliges the agency to take active steps to protect it.
Section 8.2 of the business case commits to MFA on staff accounts and to permissions
that keep booking, finance and administration duties separate.

The agency has about 25 staff and no internal IT capability, so whatever we build has
to be operable by people who will not be reading token specifications.

The decision needed: how sessions are established and carried.

## Decision

**Short-lived JWT access tokens plus rotating opaque refresh tokens in an httpOnly cookie.**

1. **Access token** — a JWT signed with `JWT_SECRET`, valid 15 minutes, sent as
   `Authorization: Bearer`. The browser keeps it in a JavaScript variable, never in
   `localStorage` or `sessionStorage`.
2. **Refresh token** — 48 random bytes, delivered in an `httpOnly`, `SameSite=Lax`
   cookie scoped to `/api/v1/auth`. Only its SHA-256 hash is stored, in `refresh_tokens`.
3. **Rotation with reuse detection** — each refresh revokes the presented token and
   issues a new one, recording the link between them. Presenting an already-rotated
   token revokes every session for that user.
4. **Per-account lockout** — five failed sign-ins locks the account for 15 minutes,
   alongside a coarser per-IP rate limit on the endpoint.
5. **User loaded per request** — the authenticate middleware reads the user from the
   database rather than trusting the token claims.

## Why not the alternatives

**Both tokens in `localStorage`.** Much simpler: survives reload with no refresh call,
no cookie or CORS credential handling. Rejected because any script that executes on
the page can read `localStorage`, and a single XSS bug would then hand over working
sessions to a system holding passport and health records. The convenience is real, but
it is convenience for us and risk for the traveller.

**Server-side sessions in MySQL or Redis.** Genuinely simpler to reason about, and
revocation is instant by construction. Rejected mainly because the traveller mobile app
is a first-class client in Release 1, and bearer tokens travel better to a native client
than cookies do. The refresh-token table gives us most of the revocation benefit anyway.

**Long-lived JWTs with no refresh.** Rejected outright: a stolen token would stay valid
until expiry with no way to revoke it, and lengthening expiry to avoid nagging sign-ins
makes that worse.

**A library such as Passport.** Adds a dependency and an abstraction layer over what
turns out to be a few hundred lines. For a team learning the material, the explicit
version is more useful; the library remains an option if third-party sign-in is ever added.

## Consequences

**Good**

- XSS cannot read either token off disk.
- A stolen refresh token has a bounded useful life, and reuse is detected rather than
  silently exploited.
- Deactivating an account takes effect on the next request, not at token expiry.
- The `refresh_tokens` table gives the audit trail Section 8.2 asks for: which device,
  which IP, when issued, when revoked.

**Costs and constraints**

- The client must handle a 401/refresh/retry cycle. It is in one place
  (`client/src/services/apiClient.js`) with a shared promise so concurrent 401s do not
  stampede the endpoint, but it is real complexity.
- Every authenticated request costs one primary-key lookup. Acceptable at this scale;
  revisit with a short-lived cache if it ever is not.
- `SameSite=Lax` assumes the client and API are served from the same site. If the API
  moves to a different registrable domain, the cookie must become `SameSite=None;
  Secure` and the CORS configuration must be revisited. In development the Vite proxy
  keeps everything on one origin so this behaves the same locally as in production.
- Refresh-token rows accumulate. `authService.purgeExpiredTokens()` exists for a
  scheduled job; that job is not yet wired up.

## Follow-up

- MFA (TOTP) for staff accounts — required by Section 8.2, not yet built. Slots in as an
  extra step between password verification and refresh-token issue.
- `requireRole` middleware for duty separation. The `role` column and the client's
  `ProtectedRoute roles` prop are already in place.
- Administrator-managed account creation and password reset.
- Schedule `purgeExpiredTokens` in `server/src/jobs/`.
- Confirm the deployment topology before go-live, so the `SameSite` decision above is
  checked against reality rather than assumed.
