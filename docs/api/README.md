# TrailAsia API — conventions

Base URL: `/api/v1` · All requests and responses are JSON.

| Area | Reference |
| --- | --- |
| Authentication and sessions | [`auth.md`](auth.md) |
| Staff accounts | [`users.md`](users.md) |
| Destinations and document requirements | [`destinations.md`](destinations.md) |
| Travellers and their documents | [`travellers.md`](travellers.md) |
| Bookings and itineraries | [`bookings.md`](bookings.md) |

---

## Response envelope

Every response has the same outer shape, so a client needs one way to read a result.

```jsonc
// single resource
{ "data": { "booking": { ... } } }

// collection
{ "data": [ ... ], "meta": { "page": 1, "perPage": 25, "total": 87, "totalPages": 4 } }

// failure
{ "error": { "message": "Some fields need attention.", "code": "VALIDATION_ERROR",
             "details": { "returnDate": "Return date cannot be before departure." } } }
```

`details` appears on validation errors, keyed by field name, so a form can render
messages inline rather than showing one banner for the whole submission.

## Status codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Created |
| 204 | Success, no body (deletes, logout, password reset) |
| 400 | Validation failure or a broken business rule |
| 401 | Not authenticated, or the access token expired |
| 403 | Authenticated, but the role is not permitted |
| 404 | No such resource |
| 429 | Rate limited |
| 500 | A bug on our side |

## Authentication

Every endpoint except `/auth/login` and `/auth/refresh` needs
`Authorization: Bearer <accessToken>`. See [`auth.md`](auth.md).

## Roles

| Role | Can do |
| --- | --- |
| `consultant` | Bookings, itineraries, travellers, documents. Sees unmasked passport numbers. |
| `coordinator` | Everything a consultant can, plus destinations, document requirements, and **verifying** documents. |
| `finance` | Read-only across bookings and travellers. Passport numbers stay masked. |
| `admin` | Everything, including staff accounts. |

Document verification is deliberately kept away from consultants: the person who
enters an insurance policy should not be the person who attests that it is real.

## List parameters

Every collection endpoint accepts:

| Parameter | Default | Notes |
| --- | --- | --- |
| `page` | `1` | |
| `perPage` | `25` | Capped at 100 |
| `sort` | Varies | `field:asc` or `field:desc`. Only allow-listed fields; anything else is a `400 INVALID_SORT` |
| `q` | — | Free-text search across the resource's name-ish fields |

Endpoint pages list their own filters and sortable fields.

## Money

Amounts are **strings with exactly two decimal places** (`"8450.50"`), paired with a
separate `currencyCode`. They are strings on the way in and on the way out, and are
never put through a JavaScript number — `0.1 + 0.2` is the reason. Send `"8450.5"`
or `8450.5` and you will get `"8450.50"` back.

## Dates

Calendar dates (departure, expiry, date of birth) are `YYYY-MM-DD` with no time or
timezone — a departure on the 14th is the 14th wherever you read it. Timestamps
(`createdAt`, `verifiedAt`) are ISO 8601 UTC.

## Ids

Ids are returned as **strings**, not numbers. They are `BIGINT` in MySQL and would
lose precision in JavaScript's number type at scale. Send them as strings or numbers;
they always come back as strings.

## Deletes

`DELETE` on a user, traveller or destination **deactivates** it — historic bookings
reference these records, and a hard delete would either break the reference or
quietly rewrite what happened. Records that nothing depends on can be removed for
real; where that is possible the endpoint says so.
