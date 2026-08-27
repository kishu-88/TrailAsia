# Destinations and document requirements

Base path: `/api/v1/destinations`

Reference data: the countries and regions the agency runs programmes in, and what a
traveller must hold to enter each one. This is the table that makes the document
checklist computable — without it, "what does Bhutan need again?" stays in a second
spreadsheet and in one consultant's head.

**Reading:** any signed-in role. **Editing:** coordinator or admin.
**Permanent delete:** admin only.

---

## `GET /destinations`

| Filter | Notes |
| --- | --- |
| `region` | e.g. `Himalaya`, `Southeast Asia` |
| `isActive` | `true` / `false` |
| `q` | Matches name or code |

Sortable: `name` (default), `code`, `region`, `createdAt`.

## `GET /destinations/:id`

Returns the destination **with its document requirements** included.

```json
{
  "data": {
    "destination": {
      "id": "1",
      "code": "NP",
      "name": "Nepal",
      "countryCode": "NP",
      "region": "Himalaya",
      "currencyCode": "NPR",
      "maxAltitudeMetres": 5644,
      "advisoryNotes": "Trekking insurance must state helicopter evacuation and altitude cover…",
      "isActive": true,
      "documentRequirements": [ { "id": "2", "type": "insurance", "…": "…" } ]
    }
  }
}
```

## `POST /destinations`

```json
{
  "code": "LK",
  "name": "Sri Lanka",
  "countryCode": "LK",
  "region": "South Asia",
  "currencyCode": "LKR",
  "maxAltitudeMetres": 2524,
  "advisoryNotes": null
}
```

`code` is upper-cased on the way in and must be unique (`400 CODE_IN_USE`). It is a short
internal code rather than strictly ISO, because the agency sells programmes in places —
Tibet — that do not have a country code of their own.

## `PATCH /destinations/:id`

Strict schema; unknown fields are rejected.

## `DELETE /destinations/:id`

Sets `isActive: false`. A completed 2024 Nepal trek should not lose its destination
because the agency stopped selling that programme.

## `POST /destinations/:id/reactivate`

## `DELETE /destinations/:id/permanent`

Admin only. Hard delete, refused with `400 DESTINATION_IN_USE` (and a count) if any
itinerary segment references it.

---

## Document requirements

Requirements hang off a destination and drive
[`GET /travellers/:id/document-checklist`](travellers.md#get-travellersiddocument-checklist).

### `GET /destinations/:id/document-requirements`

Active requirements only, unless `?includeInactive=true`.

### `POST /destinations/:id/document-requirements`

```json
{
  "type": "insurance",
  "name": "High-altitude trekking cover",
  "description": "Policy must state cover to the maximum altitude of the itinerary and include helicopter evacuation.",
  "isMandatory": true,
  "leadTimeDays": 21,
  "minValidityMonths": null,
  "requiresAltitudeCover": true
}
```

| Field | What it does |
| --- | --- |
| `type` | `passport`, `visa`, `insurance`, `health_declaration`, `permit`, `vaccination`, `other` |
| `isMandatory` | Only mandatory items count toward "ready" |
| `leadTimeDays` | How far before departure this must be complete. Drives `dueBy` and `overdue` |
| `minValidityMonths` | Passports: months of validity required **beyond the return date** |
| `requiresAltitudeCover` | Insurance: the policy must state an altitude limit and an insurer contact number |

`requiresAltitudeCover` is the field that matters most here. Section 4.3 of the business
case is built on it: Smartraveller records prosecuted fraud in Nepal where operators
pressed travellers into unnecessary helicopter evacuations while pretending to verify
cover. A requirement flagged this way makes the checklist refuse to go green until the
policy's altitude limit is recorded and clears the itinerary's highest point, and until
there is a number to ring.

`400 REQUIREMENT_EXISTS` if the same type and name already exist on that destination.

### `PATCH /destinations/:id/document-requirements/:requirementId`

### `DELETE /destinations/:id/document-requirements/:requirementId`

Hard delete — requirements are rules, not records of anything that happened. Set
`isActive: false` instead if past checklists should still make sense.
