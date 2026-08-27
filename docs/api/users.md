# Staff accounts

Base path: `/api/v1/users` · **Administrator only** — every endpoint on this page
returns `403 INSUFFICIENT_ROLE` for any other role.

There is no public sign-up. Accounts are created by an administrator, which suits a
25-person agency and means every account that can reach passport and health data was
deliberately provisioned.

---

## `GET /users`

| Filter | Notes |
| --- | --- |
| `role` | `consultant`, `coordinator`, `finance`, `admin` |
| `isActive` | `true` / `false` |
| `q` | Matches first name, last name or email |

Sortable: `createdAt`, `lastName`, `email`, `role`, `lastLoginAt`.

```json
{
  "data": [
    {
      "id": "3",
      "firstName": "Bibek",
      "lastName": "Chaudhary",
      "fullName": "Bibek Chaudhary",
      "email": "bibek@himalayastravel.com.au",
      "role": "coordinator",
      "isActive": true,
      "lastLoginAt": "2026-08-27T04:11:00.000Z"
    }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "totalPages": 1 }
}
```

The password hash is excluded at the model layer, so it cannot appear here by accident.

## `POST /users`

```json
{
  "firstName": "Vishal",
  "lastName": "Rawat",
  "email": "vishal@himalayastravel.com.au",
  "password": "at-least-twelve-characters",
  "role": "consultant"
}
```

`201` with the created user. Errors: `400 EMAIL_IN_USE`, or `VALIDATION_ERROR` with
`details.password` when the password is under 12 characters.

## `GET /users/:id`

## `PATCH /users/:id`

Accepts `firstName`, `lastName`, `email`, `role`, `isActive`. The schema is **strict** —
an unrecognised field is a `400`, not something silently ignored. Sending
`{"passwordHash": "..."}` is rejected rather than absorbed.

Two guards:

- `CANNOT_CHANGE_OWN_ROLE` — an administrator cannot demote themselves. It is an easy
  slip with an expensive recovery.
- `LAST_ADMIN` — the last active administrator cannot be demoted. Promote someone else first.

## `DELETE /users/:id`

Deactivates the account and **revokes every one of their sessions immediately**, rather
than letting an access token run out its remaining minutes.

Refused with `CANNOT_DEACTIVATE_SELF` or `LAST_ADMIN`.

## `POST /users/:id/reactivate`

Restores access and clears any lockout.

## `POST /users/:id/unlock`

Clears a failed-login lockout early — for when someone rings the office rather than
waiting fifteen minutes.

## `POST /users/:id/password`

```json
{ "password": "at-least-twelve-characters" }
```

`204`. An administrator resetting someone's password revokes that user's sessions, on
the assumption that a reset may be happening *because* something went wrong.

For changing **your own** password, use `POST /auth/change-password` — it requires the
current password, which an administrator reset deliberately does not.
