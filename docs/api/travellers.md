# Travellers and documents

Base path: `/api/v1/travellers`

**Reading:** any signed-in role. **Editing:** consultant, coordinator, admin.
**Verifying a document:** coordinator or admin only.

These records hold passport numbers, health declarations and emergency contacts —
personal information under the Privacy Act 1988, with the medical notes counting as
sensitive information. Two rules follow from that and are enforced in code rather than
left to good intentions.

**Passport masking.** List responses always mask the passport number
(`"••••••567"`, with `passportMasked: true`). The full value is returned only from the
single-record endpoint, and only to consultants, coordinators and admins — the roles
that actually complete visa and permit applications. Finance sees the mask like
everybody else. That is duty separation doing something real rather than appearing in a
policy document.

**Verification is a second pair of eyes.** The consultant who records an insurance
policy cannot be the one who attests it is genuine.

---

## `GET /travellers`

| Filter | Notes |
| --- | --- |
| `isActive` | `true` / `false` |
| `nationality` | Two-letter code |
| `q` | Matches first name, last name or email |

Sortable: `lastName` (default), `firstName`, `email`, `passportExpiry`, `createdAt`.

## `GET /travellers/:id`

Includes the traveller's documents. Passport unmasked for consultant / coordinator / admin.

```json
{
  "data": {
    "traveller": {
      "id": "12",
      "fullName": "Tenzing Norgay",
      "email": "tenzing@example.com",
      "passportNumber": "PA1234567",
      "passportMasked": false,
      "passportExpiry": "2032-01-01",
      "emergencyContact": { "name": "Ang Norgay", "phone": "+61…", "relationship": "Spouse" },
      "medicalNotes": "Mild asthma; carries a reliever.",
      "isActive": true,
      "documents": [ … ]
    }
  }
}
```

## `POST /travellers`

All fields except `firstName` and `lastName` are optional — an enquiry often starts with
a name and a phone number, and the record should not have to be complete to exist.

```json
{
  "firstName": "Tenzing",
  "lastName": "Norgay",
  "email": "tenzing@example.com",
  "phone": "+61 400 000 000",
  "dateOfBirth": "1990-03-14",
  "nationality": "AU",
  "passportNumber": "PA1234567",
  "passportCountry": "AU",
  "passportExpiry": "2032-01-01",
  "emergencyContactName": "Ang Norgay",
  "emergencyContactPhone": "+61 400 000 001",
  "emergencyContactRelationship": "Spouse",
  "dietaryNotes": "Vegetarian",
  "medicalNotes": "Mild asthma; carries a reliever."
}
```

## `PATCH /travellers/:id` · `DELETE /travellers/:id` · `POST /travellers/:id/reactivate`

`DELETE` deactivates. Past bookings reference the traveller.

---

## Documents

### `GET /travellers/:id/documents`

```json
{
  "data": [
    {
      "id": "40",
      "type": "insurance",
      "destination": { "id": "1", "code": "NP", "name": "Nepal" },
      "reference": "POL-99887",
      "issuer": "Example Insurance",
      "expiresOn": "2027-03-01",
      "status": "verified",
      "effectiveStatus": "verified",
      "isExpired": false,
      "altitudeCoverMetres": 6000,
      "insurerContactPhone": "+61 2 5550 1234",
      "verifiedAt": "2026-08-27T05:00:00.000Z",
      "verifiedBy": { "id": "3", "fullName": "Bibek Chaudhary" }
    }
  ]
}
```

`status` is what a human last set. `effectiveStatus` is what is actually true right now:
a document past its expiry reports `expired` no matter what the stored status says,
because a verified-but-expired policy is not cover.

### `POST /travellers/:id/documents`

```json
{
  "type": "insurance",
  "destinationId": "1",
  "reference": "POL-99887",
  "issuer": "Example Insurance",
  "expiresOn": "2027-03-01",
  "altitudeCoverMetres": 6000,
  "insurerContactPhone": "+61 2 5550 1234"
}
```

`destinationId` is optional — a passport is a passport everywhere, so leave it null and it
counts against every destination.

### `PATCH /travellers/:id/documents/:documentId`

Changing anything substantive — `type`, `reference`, `issuer`, `expiresOn`,
`altitudeCoverMetres` — on a document that was already verified **drops it back to
`submitted`** and clears the verification. Otherwise someone could get a policy verified
and then edit its altitude cover downward, and the checklist would still show a tick.

### `POST /travellers/:id/documents/:documentId/verify`

Coordinator or admin.

```json
{ "approved": true, "notes": "Confirmed by phone with the insurer, 27/08." }
```

Sets `verified` or `rejected`, and stamps who and when. `400 DOCUMENT_EXPIRED` if the
document has already expired.

### `DELETE /travellers/:id/documents/:documentId`

---

## `GET /travellers/:id/document-checklist`

The question a consultant actually has: *what is outstanding for this person, for this
trip, and by when?*

| Parameter | Required | Notes |
| --- | --- | --- |
| `destinationIds` | yes | Comma-separated, e.g. `1,2` |
| `departureDate` | no | Enables `dueBy` and `overdue` |
| `returnDate` | no | Passport validity is measured from the return date |
| `maxAltitudeMetres` | no | Overrides the destination's own figure |

```json
{
  "data": {
    "traveller": { "id": "12", "fullName": "Tenzing Norgay" },
    "summary": { "total": 6, "mandatory": 6, "satisfied": 4, "outstanding": 2, "overdue": 1, "ready": false },
    "items": [
      {
        "destination": { "id": "1", "code": "NP", "name": "Nepal" },
        "requirement": { "id": "2", "type": "insurance", "name": "High-altitude trekking cover",
                         "isMandatory": true, "requiresAltitudeCover": true },
        "documentId": "40",
        "status": "verified",
        "satisfied": false,
        "issues": ["Altitude cover is 4000m but the itinerary reaches 5364m."],
        "dueBy": "2026-11-05",
        "overdue": false
      }
    ]
  }
}
```

**How an item is judged**

- `status` — `missing`, `on_file`, `outstanding`, `submitted`, `verified`, `rejected`, `expired`.
  `on_file` means there is no document record but the passport on the traveller's own
  record satisfies the requirement.
- `satisfied` — true only when the status is `verified` or `on_file` **and** `issues` is empty.
  Held-but-wrong is not the same as held.
- `issues` — the specific reasons it does not count:
  - a passport that expires inside the `minValidityMonths` window past the return date;
  - a document that expires before departure;
  - insurance with no stated altitude limit, or a limit below the itinerary's highest point;
  - insurance with no insurer contact number recorded.
- `dueBy` — departure minus the requirement's `leadTimeDays`.
- `overdue` — past `dueBy` and still not satisfied.
- `summary.ready` — every **mandatory** item satisfied.

The altitude and insurer-contact checks are the ones worth understanding. A traveller
can hold a real, unexpired, verified policy and still be unprotected on a 5,364m pass if
the policy stops at 4,000m. The checklist says so, in the specific, before departure —
which is the difference between the platform being paperwork and being the thing that
stops a coordinator authorising an evacuation nobody can pay for.
