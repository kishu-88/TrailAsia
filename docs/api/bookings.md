# Bookings and itineraries

Base path: `/api/v1/bookings`

**Reading:** any signed-in role, including finance, who reconcile against bookings.
**Editing:** consultant, coordinator, admin.

A booking is one trip for one party. Its itinerary is an ordered list of segments, each
tied to a destination — a three-week Nepal trek with a Bhutan extension is two segments,
which is what makes the party's document requirements computable rather than remembered.

---

## Booking lifecycle

```
enquiry ──▶ quoted ──▶ confirmed ──▶ in_progress ──▶ completed
   │           │            │              │
   └───────────┴────────────┴──────────────┴──────▶ cancelled
```

`quoted` can also go back to `enquiry`. `completed` and `cancelled` are terminal.
Anything else is a `400 INVALID_STATUS_TRANSITION`, with `details.allowed` listing what
is actually available. Every response carries `allowedNextStatuses`, so a UI can render
the right buttons rather than guessing.

This is enforced because "confirmed → enquiry" is the kind of move that quietly corrupts
a pipeline report and is not noticed for a month.

---

## `GET /bookings`

| Filter | Notes |
| --- | --- |
| `status` | One, or several comma-separated |
| `consultantId`, `coordinatorId` | |
| `destinationId` | Joins through the itinerary |
| `departingAfter`, `departingBefore` | `YYYY-MM-DD` |
| `q` | Matches title or reference |

Sortable: `departureDate` (default), `createdAt`, `reference`, `status`, `title`.

## `GET /bookings/:id`

Full detail: consultant, coordinator, lead traveller, the whole party, and the itinerary
in sequence order.

## `POST /bookings`

```json
{
  "title": "Everest Base Camp trek — March departure",
  "coordinatorId": "3",
  "travellerIds": ["12", "13"],
  "leadTravellerId": "12",
  "departureDate": "2027-03-14",
  "returnDate": "2027-04-04",
  "partySize": 2,
  "currencyCode": "AUD",
  "totalAmount": "8450.00",
  "depositAmount": "1500.00"
}
```

`consultantId` defaults to whoever is signed in. References like `TA-2026-0007` are
allocated by the server; there is no way to set one.

Errors: `INVALID_TRAVELLER` (an id in `travellerIds` does not exist),
`INVALID_STAFF_REFERENCE` (consultant or coordinator missing or deactivated), and a
`VALIDATION_ERROR` on `returnDate` if it precedes departure.

## `PATCH /bookings/:id`

Strict schema. `status` may move along an allowed transition, but **cannot be set to
`cancelled`** — cancelling requires a reason and has its own endpoint. A cancelled
booking rejects all edits (`BOOKING_CANCELLED`); a completed one rejects status changes.

## `POST /bookings/:id/cancel`

```json
{ "reason": "Traveller withdrew after a family emergency." }
```

A reason is mandatory, minimum three characters. Records `cancelledAt`. A cancellation
with no recorded reason is exactly the gap that makes a pipeline report unanswerable
three months later.

---

## Party

### `POST /bookings/:id/travellers`

```json
{ "travellerId": "14", "isLead": false, "notes": "Joining in Kathmandu." }
```

Setting `isLead: true` demotes the previous lead and updates the booking's
`leadTravellerId` in the same transaction. `400 TRAVELLER_ALREADY_ON_BOOKING` on a repeat.

### `DELETE /bookings/:id/travellers/:travellerId`

Clears `leadTravellerId` if the removed traveller was the lead.

---

## Itinerary

### `GET /bookings/:id/itinerary`

### `POST /bookings/:id/itinerary`

```json
{
  "destinationId": "1",
  "title": "Lukla to Everest Base Camp",
  "description": "Twelve-day trek with two acclimatisation days at Namche.",
  "startDate": "2027-03-16",
  "endDate": "2027-03-28",
  "accommodation": "Teahouses",
  "maxAltitudeMetres": 5364
}
```

`sequence` is optional — omit it and the segment is appended. Supplying one that is
taken returns `400 SEQUENCE_IN_USE`.

`maxAltitudeMetres` on a segment is what the readiness check measures insurance against,
so it is worth filling in for anything at altitude.

### `PATCH /bookings/:id/itinerary/:segmentId`

### `DELETE /bookings/:id/itinerary/:segmentId`

### `POST /bookings/:id/itinerary/reorder`

```json
{ "segmentIds": ["31", "29", "30"] }
```

Renumbers the whole itinerary from the given order. The list must contain **every**
segment exactly once (`400 INCOMPLETE_REORDER` otherwise) — a partial reorder has no
sensible interpretation. Internally it runs two passes inside one transaction, moving
everything to a temporary range first, because assigning final positions directly would
trip the unique `(booking, sequence)` index halfway through.

---

## `GET /bookings/:id/readiness`

Document readiness for every traveller on the booking, against every destination the
itinerary visits. This is the fourteen-days-out report: one call instead of
cross-referencing a party list against a requirements sheet by hand.

```json
{
  "data": {
    "booking": { "id": "7", "reference": "TA-2026-0007", "status": "confirmed",
                 "departureDate": "2027-03-14" },
    "summary": { "partySize": 2, "travellersReady": 1, "outstanding": 1, "overdue": 0,
                 "ready": false, "maxAltitudeMetres": 5364 },
    "travellers": [ /* one full checklist per traveller — see travellers.md */ ]
  }
}
```

The destinations are taken from the itinerary and the altitude from the highest segment,
so the insurance check is measured against where the party is actually going rather than
against a default for the country.

`400 NO_ITINERARY` if the booking has no segments yet — there would be nothing to check
requirements against, and returning an empty "all clear" would be worse than an error.
