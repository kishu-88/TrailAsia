# ADR-002: Traveller sessions and location data

**Status:** Accepted · **Date:** 2026-09-14
**Supersedes nothing. Extends [ADR-001](adr-001-authentication.md).**

## Context

The traveller-facing screens existed but were reached through a staff session. They
show passport numbers, insurance policies and medical notes, so no unauthenticated
route was ever added to them — which left the safety module, the feature the business
case says justifies building rather than buying, with nobody to belong to. A
consultant pressing SOS on a traveller's behalf from a preview screen is not the
feature.

Two questions had to be answered together: how a traveller authenticates, and what
the platform is allowed to record about where they are.

## Decision

### 1. Travellers authenticate against their own record, not a second account table

`travellers` gained `password_hash`, `portal_enabled`, an invitation hash and the
same lockout columns `users` has. There is no `users` row for a traveller.

A person then exists in exactly one place. The alternative — a parallel accounts
table joined to the traveller record — creates two rows that can disagree about
whether somebody is still on the trip, and the failure mode is an account that
outlives the record it was created for.

There is no self-registration. A consultant issues an invitation; the traveller sets
a password with it. A 25-person agency does not need open sign-up, and every account
that reaches passport data should be deliberately provisioned.

### 2. Tokens carry a scope, and the two guards are separate functions

Every access token has `scope: "staff"` or `scope: "traveller"`, with different JWT
audiences.

This is the load-bearing decision in the change. `sub` is a primary key, and the two
tables are numbered independently: traveller 7 and user 7 both exist. Without the
claim, a traveller's token presented to a staff route resolves against `users` and
comes back as a member of staff. There is a test for exactly this — a traveller and
an administrator forced onto the same id — because the failure is invisible in
ordinary use and total when it happens.

`authenticate` and `authenticateTraveller` are separate middleware rather than one
function with a branch, and `authenticateTraveller` deliberately leaves `req.user`
undefined so `requireRole` — which refuses without it — cannot pass a traveller
through.

### 3. One session table, not two

`refresh_tokens` gained `subject_type` and a nullable `traveller_id`; `user_id`
became nullable. Rotation, reuse detection and revoke-everything are the
security-critical parts of ADR-001 and now serve both audiences from one
implementation. A copy for travellers would eventually stop matching the original,
and the copy that drifts is the one nobody is reading.

The cost is that the database can no longer express "exactly one subject". That is
enforced in a `beforeCreate` hook — not a model validator, because Sequelize also
runs validators against the partial instance built for a bulk update, where neither
subject column is present.

Traveller refresh cookies have their own name and their own path, because the staff
cookie's path (`/api/v1/auth`) covers the traveller routes and a shared name would
mean one session silently replacing the other in a browser holding both.

### 4. Location sharing is per trip, consented, and purged

Three tables: `location_consents`, `location_pings`, `sos_alerts`.

- Consent is per **booking**, not a profile setting, and it starts withdrawn. The
  wording the traveller agreed to is stored verbatim on the row, so a later change to
  the wording cannot be mistaken for what they saw. Withdrawal keeps the row — it is
  the record that consent was given and then taken back.
- Pings are deleted `LOCATION_RETENTION_DAYS` (30) after the trip ends, by
  `src/jobs/purgeLocations.js`. The agency's reason for holding somebody's movements
  expires when the trip does, and nothing in that table is needed for accounting.
- **An SOS is never gated.** No consent check, no rate limit, and only `bookingId` is
  required — a phone with no fix and no signal must still be able to raise one.

Rules 1 and 4 pull against each other, and the tension is resolved rather than
fudged: the position captured when the button is pressed is copied onto the **alert**,
which is an incident record and outlives the retention window, and no ping is
written. Pressing SOS is consent to be found; it is not consent to be tracked.

Alerts are never purged, never auto-closed, and every state change records the person
who made it. A traveller may cancel their own alert but not resolve it; staff may
resolve but not cancel. "I pressed it by mistake" and "we dealt with it" are different
claims and belong to different people.

### 5. Reading alerts is open to every staff role

Wider than anything else in the codebase, including `finance`. An alert raised at 2am
must be visible to whoever is at a desk, and a role check that hides it from the only
person in the office is a worse outcome than a finance officer seeing that somebody
pressed a button. Acting on one — acknowledging, resolving — stays with trip editors,
because it is recorded against them.

## Consequences

**Good.** The safety module has an owner. Traveller screens no longer borrow a staff
session. The privacy commitments in the README are executable code rather than prose.

**Accepted costs.**

- Invitation links are handed over by a consultant, because there is no mail
  transport. The token is shown once and then only its hash exists, so losing it
  means issuing another. The friction is the honest consequence of the missing
  provider, not a design preference.
- Location capture is manual — the position is sent when the traveller taps, not on a
  timer. Continuous background tracking needs a native app; a web page claiming to do
  it would stop the moment the screen locked, and a map that silently goes stale is
  worse than one that is obviously manual.
- **Nothing pages an on-call phone.** The safety desk only helps somebody who is
  looking at it. This is the largest remaining gap in the module and it needs a
  messaging provider the agency has not chosen. Until then the after-hours promise in
  the business case is not met, and the screen says so rather than implying otherwise.

## Privacy note

Location, passport and health data are covered by the Privacy Act 1988. APP 3
(collection of sensitive information with consent) is why `location_consents` exists
and why sharing starts off; APP 11 (destruction when no longer needed) is why
`purgeLocations.js` exists. Per the working agreement in the root README, no feature
storing personal data ships without a note here — this is that note.
