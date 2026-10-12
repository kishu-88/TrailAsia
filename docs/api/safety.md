# Traveller safety API

Base path: `/api/v1/safety`

The module the business case argues cannot be bought: location sharing with real
consent, an SOS that reaches a person, and a record of what the agency knew and
when.

Three rules hold across every endpoint here.

1. **No location without consent for that trip.** Not an account preference — this
   booking. Consent starts withdrawn and is recorded when it is given.
2. **An SOS is never refused.** No consent requirement, no rate limit, no required
   fields beyond the booking. A safety feature that can say no is not one.
3. **Nothing closes itself.** An alert stays open until a person closes it, and the
   person is recorded.

Rules 1 and 2 are resolved explicitly: pressing SOS attaches the position taken at
that moment to the **alert**, which is an incident record. It does not create a
location ping and does not switch sharing on.

---

## Who calls what

| Path | Session | Roles |
| --- | --- | --- |
| `/safety/me/*` | Traveller | The traveller acts on their own record; the id comes from the session |
| `GET /safety/alerts` | Staff | `consultant`, `coordinator`, `finance`, `admin` |
| `POST /safety/alerts/:id/acknowledge` · `…/resolve` | Staff | `consultant`, `coordinator`, `admin` |
| `GET /safety/alerts/:id/events` · `GET /safety/events` | Staff | `consultant`, `coordinator`, `finance`, `admin` |
| `GET /safety/bookings/:id/locations` | Staff | `consultant`, `coordinator`, `admin` |

Reading alerts is open to **every** staff role, finance included — wider than
anything else in this API. An alert raised at 2am must be visible to whoever is
actually at a desk, and a role check that hides it from the only person in the
office is a worse outcome than a finance officer seeing that somebody pressed a
button. Acting on one is narrower, because it is recorded against the person who
did it.

---

## `GET /safety/me?bookingId=…`

Traveller session. Everything the safety screen needs, in one call.

```jsonc
{ "data": {
  "bookingId": "12",
  "consent": { "status": "granted", "granted": true, "grantedAt": "2026-09-14T06:12:00.000Z",
               "withdrawnAt": null, "consentStatement": "I agree to share my location …" },
  "consentStatement": "I agree to share my location with Himalayas Travel and Tour for the duration of this trip. I can stop sharing at any time. Records are deleted after the trip ends.",
  "lastSeen": { "id": "88", "latitude": 27.717245, "longitude": 85.32396,
                "accuracyMetres": 12, "altitudeMetres": 1400, "batteryPercent": 42,
                "source": "device", "recordedAt": "2026-09-14T06:40:00.000Z" },
  "openAlert": null,
  "retentionDays": 30
} }
```

`consentStatement` at the top level is the **current** wording, for display. The one
inside `consent` is what this traveller actually agreed to, kept verbatim so a later
change to the wording cannot be mistaken for what they saw.

## `POST /safety/me/consent`

```json
{ "bookingId": "12", "granted": true }
```

Returns the consent record. Withdrawal (`false`) is instant and needs no reason. It
stops further collection; it does not delete what was already collected — those
records were collected lawfully and go on the ordinary retention schedule below.

`404` if the traveller is not on that booking. Deliberately "not found" rather than
"forbidden": confirming a booking exists but belongs to somebody else is itself a
disclosure.

## `POST /safety/me/pings`

```jsonc
{ "bookingId": "12", "latitude": 27.717245, "longitude": 85.32396,
  "accuracyMetres": 12, "altitudeMetres": 1400, "batteryPercent": 42,
  "recordedAt": "2026-09-14T06:40:00.000Z" }   // optional, defaults to now
```

| Status | Meaning |
| --- | --- |
| `201` | Stored |
| `202` | Accepted and folded into the previous ping — they arrived closer together than `MIN_PING_INTERVAL_SECONDS` (default 30). The client is behaving correctly and there is nothing to fix, so this is not an error. |
| `403 LOCATION_CONSENT_REQUIRED` | Sharing is off for this trip |
| `400` | Coordinates outside their valid ranges |

Refused rather than silently dropped when consent is off: a phone that thinks it is
sharing when it is not is worse than one that knows it isn't.

## `GET /safety/me/pings?bookingId=…&limit=50`

The traveller's own recent positions, newest first. Capped at 500.

## `POST /safety/me/sos`

```jsonc
{ "bookingId": "12",           // the only required field
  "latitude": 27.717245, "longitude": 85.32396, "accuracyMetres": 12,
  "message": "Injured on the pass" }
```

Everything except `bookingId` is optional, on purpose. A phone with no fix, no
signal to type a message and four seconds of battery must still be able to raise
one; requiring a position would fail exactly the alerts that matter most.

| Status | Meaning |
| --- | --- |
| `201` | A new alert was created |
| `200` | An alert for this traveller and trip was already open — it is returned unchanged |

Pressing the button repeatedly is expected behaviour for somebody in trouble, and
the consequence should not be a queue of duplicates for whoever is answering.

## `POST /safety/me/sos/:id/cancel`

The traveller withdraws their own alert — theirs only, and only while it is open.
`404` for anyone else's. A traveller can cancel but cannot resolve; staff can
resolve but cannot cancel. "I pressed it by mistake" and "we dealt with it" are
different claims, made by different people.

---

## `GET /safety/alerts?status=open`

`status` is one of `open` (raised + acknowledged), `raised`, `acknowledged`,
`resolved`, `cancelled`, or omitted for all. Optional `bookingId`.

Open alerts come first and, within that, oldest first — the one that has been
waiting longest is the one that matters. Every other list in this API sorts newest
first; this one deliberately does not.

```jsonc
{ "data": [ {
  "id": "3", "status": "raised", "isOpen": true,
  "raisedAt": "2026-09-14T06:44:00.000Z", "minutesOpen": 11,
  "latitude": 27.717245, "longitude": 85.32396, "accuracyMetres": 12,
  "message": "Injured on the pass",
  "traveller": { "id": "7", "fullName": "Ang Dorje", "phone": "+977 …",
                 "emergencyContact": { "name": "…", "phone": "…", "relationship": "sister" } },
  "booking": { "id": "12", "reference": "TA-2026-0007", "title": "Everest Base Camp trek" },
  "acknowledgedAt": null, "resolvedAt": null, "cancelledAt": null
} ] }
```

The emergency contact is on the alert itself rather than a link away. Whoever is
answering at 2am should not have to open two more screens to find a phone number.

## `POST /safety/alerts/:id/acknowledge`

Records who has taken it and when. Acknowledging is not resolving: it says somebody
has seen it and is acting, which is what a traveller most needs to know and what a
duty roster most needs recorded. `400 ALERT_NOT_OPEN` if it is not in `raised`.

## `POST /safety/alerts/:id/resolve`

```json
{ "notes": "Spoke to the guide; traveller evacuated to Lukla and is well." }
```

`notes` is **required**, minimum 5 characters. A closed alert with no account of how
it was closed is not a record of anything, and it is the field an incident review
reads first. `400 ALERT_CLOSED` if it is already closed.

## The log: `GET /safety/alerts/:id/events` and `GET /safety/events`

Everything that has happened to an alert, one entry per event. The alert row keeps
only the latest of each thing — one assignee, one acknowledgement — so a hand-over
overwrites the previous name and an escalation leaves no mark on it at all. The log
is where that history lives. It is append-only: nothing in the API edits or removes
an entry.

| `type` | Written when | `actor.kind` | `detail` |
| --- | --- | --- | --- |
| `raised` | A traveller raises an alert. Not on a repeat press that returns the open one | `traveller` | `Position sent.` or `No position sent.`, then the traveller's note if they wrote one |
| `acknowledged` | Staff acknowledge | `staff` | — |
| `assigned` | Staff hand it to someone | `staff` | `To <name>` |
| `unassigned` | Staff clear the assignee | `staff` | `Was with <name>` |
| `escalated` | The escalation sweep notifies at least one person at a new level | `system` | `Unclaimed for N minutes. M people notified.` |
| `resolved` | Staff close it | `staff` | The resolution notes |
| `cancelled` | The traveller withdraws it | `traveller` | — |

`GET /safety/alerts/:id/events` returns one alert's entries, oldest first:

```jsonc
{ "data": [
  { "id": "41", "alertId": "7", "type": "raised",
    "actor": { "kind": "traveller", "name": "Kishor Thapa" },
    "detail": "Position sent. Note: \"Twisted ankle above Namche\"",
    "createdAt": "2026-10-05T10:03:11.000Z" },
  { "id": "42", "alertId": "7", "type": "escalated",
    "actor": { "kind": "system", "name": null },
    "detail": "Unclaimed for 6 minutes. 4 people notified.",
    "createdAt": "2026-10-05T10:09:00.000Z" }
] }
```

`GET /safety/events` returns entries across every alert, newest first, in the usual
`{ data, meta }` list envelope. Each entry also carries `alert` — its `id`, current
`status`, the traveller's name and the booking's reference and title. Query:
`type`, `alertId`, `bookingId`, `page`, `perPage`.

The log holds no coordinates, only whether a position was sent. The position itself
stays on the alert.

Writing an entry never blocks the action it describes. If the insert fails, the
failure is reported on the server and the alert is still raised, acknowledged or
closed.

Alerts that existed before the log were given entries from the columns they already
had. Earlier assignees that had been overwritten, and escalations, could not be
reconstructed and are absent for those alerts.

## `GET /safety/bookings/:bookingId/locations`

Where the party was last seen.

```jsonc
{ "data": { "bookingId": "12", "reference": "TA-2026-0007", "party": [
  { "traveller": { "id": "7", "fullName": "Ang Dorje", "phone": "+977 …" },
    "sharing": true, "consentStatus": "granted",
    "lastSeen": { "latitude": 27.717245, "longitude": 85.32396, "recordedAt": "…" },
    "hoursSinceLastSeen": 2.4 },
  { "traveller": { "id": "8", "fullName": "Mira Sun" },
    "sharing": false, "consentStatus": "not_asked", "lastSeen": null,
    "hoursSinceLastSeen": null }
] } }
```

Everyone on the booking appears, including those who are not sharing, and their
entry says so. Omitting them would let a coordinator scanning the list read "not on
the list" as "accounted for".

`hoursSinceLastSeen` exists so that "sharing, but silent for two days" reads
differently from "sharing, seen twenty minutes ago".

Not open to `finance`: this is live location data about identified people, and
reconciliation has no use for it.

---

## Retention

| Setting | Default | What it governs |
| --- | --- | --- |
| `LOCATION_RETENTION_DAYS` | `30` | Days after a trip ends before its location pings are deleted |
| `MIN_PING_INTERVAL_SECONDS` | `30` | Pings closer together than this are folded into the previous one |
| `SOS_ESCALATION_EMAIL` | — | Reserved; no mail transport exists yet |

`src/jobs/purgeLocations.js` deletes pings for bookings whose return date (or
departure date, if there is no return) is more than the retention window in the
past. Bookings with neither date are left alone rather than guessed at.

```bash
node -e "require('./src/jobs/purgeLocations').run().then(console.log)"
```

It is not wired to a scheduler yet — run it from cron or Task Scheduler. The README
promises location records do not outlive the trip; this job is that promise, and a
promise in a document with no code behind it is just a document.

SOS alerts are **not** purged. An incident record is not location tracking, and an
SOS is exactly the thing somebody reviews months later.

---

## Not built

- Automatic background location capture. Sharing is manual: the position goes out
  when the traveller taps, not on a timer. Continuous tracking needs a native app,
  and a web page claiming to do it would quietly stop the moment the screen locked.
- Paging an on-call phone. The safety desk only helps somebody who is looking at it;
  making the after-hours promise real needs a messaging provider the agency has not
  chosen. This is the largest remaining gap in the module.
- Scam alerts and the fair-price guide.
