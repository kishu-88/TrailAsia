# Public site (TrailAsia Book)

Base path: `/api/v1/public`

No authentication anywhere on this router — it is the only way in for
[TrailAsia Book](../../../TrailAsia-Book/README.md), the separate,
public-facing site where a stranger with no account can browse and enquire.
Everything else in this API needs a staff or traveller session; this is the
one deliberate exception, and it stays deliberately narrow — see
`server/src/controllers/public.controller.js` and
`server/src/services/destination.service.js` (`listPublic`/`getPublicById`)
for how the shape is kept separate from the staff endpoints rather than
reused with a role check bolted on.

---

## `GET /public/destinations`

Same filters as [`GET /destinations`](destinations.md#get-destinations)
(`region`, `q`), always restricted to `isActive: true` regardless of what is
passed. Returns a narrower shape than the staff endpoint — marketing fields
only:

```json
{ "data": [{ "id": "1", "code": "NP", "name": "Nepal", "region": "Himalaya",
             "countryCode": "NP", "currencyCode": "NPR",
             "maxAltitudeMetres": 5644, "advisoryNotes": "…",
             "summary": "Trek to Everest Base Camp with local guides.",
             "heroImageUrl": "https://…", "highlights": ["Sherpa-led guides"],
             "durationDays": 14, "priceFrom": { "amount": "2500.00", "currencyCode": "AUD" },
             "bestTimeToVisit": "March–May and September–November",
             "fitnessLevel": "strenuous",
             "whatToPack": ["Layered thermal clothing", "Broken-in trekking boots"],
             "cultureNotes": "Dress modestly in villages; ask before photographing monasteries.",
             "attractions": [{ "name": "Kathmandu Durbar Square", "description": "UNESCO World Heritage royal palace complex." }],
             "thingsToKnow": [{ "label": "Currency", "value": "Nepalese Rupee (NPR)" }] }] }
```

No document requirements, no internal timestamps — a shape that happens to
be safe today should not become unsafe the first time somebody adds an
internal field to the staff destination for a staff screen. The marketing
fields (`summary`, `heroImageUrl`, `highlights`, `durationDays`,
`priceFrom`) live on `destinations` itself — see the
`add-destination-marketing-fields` migration — and are `null`/`[]` until
staff back them in; the public site renders around their absence rather
than requiring them.

The travel-guide fields (`bestTimeToVisit`, `fitnessLevel`, `whatToPack`,
`cultureNotes`) follow the same rule — see the
`add-destination-travel-guide-fields` migration. `fitnessLevel` is one of
`easy` / `moderate` / `challenging` / `strenuous`, or `null` until set.
`whatToPack` is an ordered array of short strings, same pattern as
`highlights`, defaulting to `[]` rather than `null` so the client never has
to guard against both. All six seeded destinations have this content
backed in by the `destination-marketing-content` seed — a destination
created by staff afterwards starts with it unset, same as the marketing
fields.

Two more fields round out the destination page — see the
`add-destination-attractions-and-facts` migration:

- `attractions` — named tourist attractions within the country (e.g.
  Kathmandu Durbar Square, Ha Long Bay), each `{ name, description }`.
  Distinct from `highlights`, which describes the trip itinerary itself
  rather than the destination as a place.
- `thingsToKnow` — quick practical facts, each `{ label, value }` (e.g.
  Currency, Language, Time zone, Visa, Plugs). A flexible list rather than
  fixed columns, since not every destination needs the same facts.

Both default to `[]`, same as `highlights`/`whatToPack`, and are backed in
for all six seeded destinations by the
`destination-attractions-and-facts` seed.

## `GET /public/destinations/:id`

Same shape as one row above, plus `testimonials`: that destination's
published quotes (`Testimonial`, newest first, capped at 12). `404` for an
inactive destination, the same as for one that does not exist — inactive is
not information the public site exposes either.

## `GET /public/testimonials`

Published testimonials across the whole site, newest first, capped at 24.
Optional `?destinationId=` narrows to one destination's quotes — used by the
destination page above; omitted, it returns everything (mostly the
agency-wide, no-destination quotes used on the homepage). Read-only: a
testimonial is entered by staff, never by a site visitor, so there is no
`POST` here.

```json
{ "data": [{ "id": "4", "destinationId": null, "authorName": "The Okafor family",
             "tripReference": "TA-2025-0031", "quote": "…", "rating": 5 }] }
```

## `POST /public/booking-enquiries`

Rate limited per IP (`PUBLIC_ENQUIRY_RATE_LIMIT_MAX`, default 10 per 15
minutes) — the only brake available, since there is no account here for a
per-account lockout to apply to.

```json
{
  "firstName": "Priya",
  "lastName": "Shah",
  "email": "priya@example.com",
  "phone": "+61 400 000 000",
  "destinationId": "1",
  "departureDate": "2027-03-14",
  "returnDate": "2027-04-04",
  "partySize": 2,
  "message": "Keen on a March departure if possible.",
  "additionalDestinationIds": ["3"]
}
```

Everything but name, email and `destinationId` is optional — this is a lead,
not a confirmed itinerary; a consultant fills in the rest after following
up. `phone`, `departureDate`, `returnDate`, `partySize` (default `1`),
`message` and `additionalDestinationIds` may all be omitted.
`additionalDestinationIds` (up to 4) is for someone planning more than one
leg — "Everest, then a few days in Kathmandu" — and becomes extra itinerary
segments on the same enquiry rather than a second booking; deduplicated
against the lead destination and each other.

**What happens under the hood** (`bookingService.createPublicEnquiry`):

1. **Find or create the traveller**, matched by email. The same person
   enquiring twice is one lead, not two.
2. **Pick a consultant to own it.** `PUBLIC_ENQUIRY_CONSULTANT_ID` if it's
   set and still active; otherwise the first active consultant, then the
   first active admin. A booking's `consultantId` is `allowNull: false` and
   nothing in the rest of the codebase — the reports, the pipeline board —
   expects one without an owner, so this does not relax that column. It
   picks one instead.
3. **Create a normal `enquiry`-stage booking** — the same status a phone
   call starts at — with one itinerary segment per selected destination
   (lead first, then each of `additionalDestinationIds` in the order given),
   so it drops straight into the existing staff pipeline
   (`GET /bookings?status=enquiry`) rather than a parallel one.
4. **Notify the assigned consultant** (`booking_enquiry_received`, see
   [`notifications.md`](notifications.md)) — the bell is how they find out a
   new lead exists at all, since nobody was watching this request happen.

**Response `201`** — deliberately not the staff booking shape
(`toPublicJSON()`), which carries the consultant's name, internal notes and
money fields:

```json
{ "data": { "enquiry": { "reference": "TA-2026-0007", "status": "enquiry",
            "title": "Nepal enquiry — Priya Shah", "departureDate": "2027-03-14",
            "returnDate": "2027-04-04", "partySize": 2 } } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/malformed fields; `details` names them |
| 400 | `INVALID_DESTINATION` | Unknown or inactive `destinationId` |
| 429 | `TOO_MANY_REQUESTS` | Per-IP rate limit tripped |

## `POST /public/contact-messages`

The general "get in touch" form on TrailAsia Book's About page — for
anything that isn't a specific trip. Rate limited per IP the same way as the
enquiry form above (`PUBLIC_ENQUIRY_RATE_LIMIT_MAX`), but its own limiter
instance with its own counter, so filling in one form doesn't eat into the
other's budget.

```json
{
  "name": "Jordan Lee",
  "email": "jordan@example.com",
  "phone": "+61 400 111 222",
  "message": "Do you run small-group departures for Bhutan in October?"
}
```

`phone` is optional; everything else is required. Unlike
`POST /public/booking-enquiries`, this never touches `Traveller` or
`Booking` — it's its own `contact_messages` row (`ContactMessage`
model/service), because a "do you take group bookings?" question isn't a
trip. It notifies the same trip-editor audience as a booking enquiry
(`contact_message_received`, see [`notifications.md`](notifications.md)),
since a general message could turn into any of their work; there is no
staff screen for these messages yet, so the notification's `link` is `null`.

**Response `201`** — deliberately slim, not the message's own row:

```json
{ "data": { "received": true, "id": "12" } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/malformed fields; `details` names them |
| 429 | `TOO_MANY_REQUESTS` | Per-IP rate limit tripped |

## What this is not

Not a second traveller identity system. A traveller created this way has no
portal access — `portalEnabled` stays `false` — until a consultant follows
up, confirms a real booking, and issues a portal invite the normal way (see
[`auth.md`](auth.md#traveller-sessions)). TrailAsia Book's own sign-in reuses
that same flow for travellers who already have it, rather than building
another one.
