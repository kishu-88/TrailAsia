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
      "verifiedBy": { "id": "3", "fullName": "Bibek Chaudhary" },
      "operatorConfirmationId": "12",
      "operatorConfirmation": { "id": "12", "summary": "Sagarmatha national park permit", "status": "confirmed" }
    }
  ]
}
```

`status` is what a human last set. `effectiveStatus` is what is actually true right now:
a document past its expiry reports `expired` no matter what the stored status says,
because a verified-but-expired policy is not cover.

`operatorConfirmationId`/`operatorConfirmation` are only present when the
document was obtained through a ground-operator arrangement — a permit,
mainly — and are `null`/absent otherwise. The same link shows up the other
way on `GET /operators/bookings/:id/readiness`, under each confirmation's
own `documents` array (there's no `docs/api/operators.md` yet — this
endpoint and the rest of the operators API are documented only in
`operator.service.js` and `operator.controller.js` themselves).

Every row also carries `filePath` (an external link, if that's what was
given instead of a file), `hasFile`, `fileName`, `fileMimeType` and
`fileSizeBytes` — see the upload/download endpoints below. Never a raw path
into the upload directory; that's retrieved by document id, not by name.

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

`operatorConfirmationId` can also be set (or cleared with `null`) here, to
link or unlink the document from a ground-operator arrangement. It must
point to an existing confirmation (`INVALID_OPERATOR_CONFIRMATION`
otherwise) and is deliberately **not** one of the substantive fields above —
relinking a permit to the right confirmation doesn't mean its content needs
re-checking.

### `POST /travellers/:id/documents/:documentId/verify`

Coordinator or admin.

```json
{ "approved": true, "notes": "Confirmed by phone with the insurer, 27/08." }
```

Sets `verified` or `rejected`, and stamps who and when. `400 DOCUMENT_EXPIRED` if the
document has already expired.

### `POST /travellers/:id/documents/:documentId/file`

`multipart/form-data`, one `file` field (PDF, JPEG, PNG or WebP, capped at
`UPLOAD_MAX_BYTES`). Attaches a file to a document row created via `POST
.../documents` above — metadata first, file second, the same two steps
whether the file comes from staff or from the traveller themselves via `POST
/me/documents` ([`auth.md`](auth.md)). Stored on disk under `UPLOAD_DIR`,
named by a random id — never the uploaded filename. Replaces any previous
file on that document (the old one is deleted only after the new one is
safely written), and — like `PATCH` above — drops a `verified` document back
to `submitted`, since a new file is exactly the kind of substantive change
that invalidates a prior verification.

```json
{ "data": { "document": { "id": "40", "hasFile": true,
            "fileName": "policy.pdf", "fileMimeType": "application/pdf",
            "fileSizeBytes": 88213, "status": "submitted" } } }
```

### `GET /travellers/:id/documents/:documentId/file`

Downloads the file attached above. `404` if the document has none yet.

### `DELETE /travellers/:id/documents/:documentId`

Also removes its uploaded file from disk, if it has one.

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
- **Which document** — a document counts for a requirement when its type matches and
  it is either for that destination or has no destination (a passport is a passport).
  When a traveller holds more than one, a `verified` one with no issues wins and the
  item is satisfied. Otherwise the item describes the **newest**, so a replacement for
  a rejected or expiring document shows as `submitted` rather than the old one still
  failing. `documentId` says which one was used.

The altitude and insurer-contact checks are the ones worth understanding. A traveller
can hold a real, unexpired, verified policy and still be unprotected on a 5,364m pass if
the policy stops at 4,000m. The checklist says so, in the specific, before departure —
which is the difference between the platform being paperwork and being the thing that
stops a coordinator authorising an evacuation nobody can pay for.


---

## Portal access

| Endpoint | Roles | Does |
| --- | --- | --- |
| `POST /travellers/:id/portal-invite` | `consultant`, `coordinator`, `admin` | Issues a single-use invitation; returns the link once |
| `DELETE /travellers/:id/portal-access` | `consultant`, `coordinator`, `admin` | Withdraws access and ends every live session |

Not admin-only. The consultant who set the booking up is the person the traveller
rings when the link does not work, and routing that through an administrator adds a
delay without adding a check — the consultant already has full access to the record
the portal exposes.

Every traveller payload carries a `portal` block for the staff screens:

```jsonc
"portal": { "state": "active",        // not_invited | invited | invite_expired | active | suspended
            "enabled": true, "invitedAt": "…", "inviteExpiresAt": "…",
            "activatedAt": "…", "lastLoginAt": "…", "lockedUntil": null }
```

Full detail, including what a traveller can see once they are in, is in
[`auth.md`](auth.md#traveller-sessions).
