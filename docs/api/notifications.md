# Notifications API

Base path: `/api/v1/notifications`

The bell in the top bar. **In-app only** — nothing here sends email or SMS. The
agency has not chosen a provider, and a delivery path that has never been tested
against a real emergency should not be shipped as though it had been.

---

## How it works

Notifications are **fanned out at write time**: one row per recipient, created by
the module where the event happened. A feed assembled at read time has to
re-derive "has this person seen it" from somewhere anyway, and the somewhere is a
table like this one. It also means a notification says what was true when it was
raised — "SOS raised by Ang Dorje" still reads that way after the alert is
resolved.

Two rules hold everywhere:

1. **Raising a notification never breaks the thing that caused it.** Every
   producer call is wrapped; a failed insert is logged and swallowed. The SOS is
   still raised, the task is still assigned. There is a test that replaces the
   insert with a thrower and asserts the task creation still returns `201`.
2. **Nobody is told what they just did.** The actor is filtered out of every
   audience. A bell that lights up because you clicked something trains people to
   ignore it, and an ignored bell looks like coverage that is not there.

---

## What raises one

| Event | Who hears about it | Severity |
| --- | --- | --- |
| `sos_raised` | Every active consultant, coordinator and admin | `urgent` |
| `sos_acknowledged` | The same, minus the person who acknowledged | `warning` |
| `sos_resolved` | The same, minus the person who closed it | `info` |
| `task_assigned` | The new owner, unless they assigned it to themselves | `info` / `warning` if urgent |
| `task_handover` | The person receiving the work — **one** notification for the whole handover | `warning` |
| `task_overdue` | The task's owner, from the scheduled sweep | `warning` / `urgent` |
| `document_verified` · `document_rejected` | Whoever created the traveller record | `info` / `warning` |
| `portal_activated` | Whoever created the traveller record | `info` |
| `booking_cancelled` | The booking's consultant and coordinator, minus the canceller | `warning` |
| `payment_received` | The booking's consultant and coordinator | `info` |
| `payment_failed` | The booking's consultant and coordinator | `warning` |
| `payment_due_soon` | The booking's consultant and coordinator, plus everyone in finance | `info` |
| `payment_overdue` | The booking's consultant and coordinator, plus everyone in finance | `warning` |
| `booking_enquiry_received` | The consultant a public enquiry was assigned to (see [`public.md`](public.md)) | `info` |
| `document_submitted` | Whoever created the traveller record | `info` |
| `contact_message_received` | The trip-editor roles (consultant/coordinator/admin) a booking enquiry would reach (see [`public.md`](public.md)) | `info` |

**Finance is not in the SOS audience.** They can read the safety desk, but they
cannot acknowledge or resolve an alert — a bell for something you have no way to
act on is noise.

**One notification per handover, not one per task.** Twelve bells for one
decision is how a bell stops being read.

**Verification notifies the consultant who entered the record.** Verifying a
document is deliberately somebody else's job (see `requireRole`), so without this
the consultant has to keep checking whether it happened.

**A traveller adding their own document notifies the same person, but is a
different type.** `document_submitted` (raised from the traveller portal, see
`auth.md`'s `/me` section) is kept separate from `document_verified`/
`document_rejected` rather than reused, because those describe staff acting
on a document and this describes a traveller adding one — a bell reading
"verified" for something nobody has looked at yet would be wrong.

**Payment reminders reach finance too, not just the trip owners.** Every other
row here goes to the people running that one trip. The instalment reminders
widen that to everyone in finance, because chasing a payment is their job
however the booking is assigned, and they have no per-booking role to read the
audience from otherwise (`MONEY_RECORDERS` in `payment.routes.js`).

---

## `GET /notifications`

| Parameter | Notes |
| --- | --- |
| `status` | `unread`, or omit for everything |
| `page` · `perPage` · `sort` | Sortable: `createdAt` (default `createdAt:desc`) |

```jsonc
{ "data": [ {
  "id": "31", "type": "sos_raised", "severity": "urgent",
  "title": "SOS — Ang Dorje",
  "body": "TA-2026-0001 · Everest Base Camp trek. A position was reported.",
  "link": "/safety", "read": false, "readAt": null,
  "actor": null, "createdAt": "2026-09-17T00:59:00.000Z"
} ], "meta": { "…": "…" } }
```

`link` is a **client route**, not a URL — the API has no business knowing the
client's host. `actor: null` means no member of staff caused it: a traveller
pressing SOS, or the overdue sweep. The bell shows no attribution in that case
rather than inventing one, because a single word would be wrong about one of the
two.

The recipient always comes from the session. There is no user id in any path
here, so there is nothing to tamper with — the same reasoning as `/me`.

## `GET /notifications/unread-count`

```json
{ "data": { "unread": 3, "urgent": 1 } }
```

Polled by the bell every 60 seconds. Urgent is counted separately so the badge
can shout when it should and stay quiet when it should not.

## `POST /notifications/:id/read` · `POST /notifications/read-all`

Marking somebody else's as read returns `404`, not `403` — whether another
person's notification exists is not a question this endpoint should answer.

---

## Deduplication

`dedupe_key` is unique per recipient. A repeated condition creates nothing rather
than piling up: pressing SOS twice raises one notification, and a task sitting
overdue for a fortnight produces one, not fourteen.

The key carries enough to make a genuinely new fact new — `task:14:overdue:2026-09-20`
includes the due date, so a task that is pushed out and goes late again notifies
properly.

## The scheduled sweep

`src/jobs/taskReminders.js` raises overdue-task notifications and deletes read
notifications older than 60 days. Unread ones are kept however old: nobody has
seen it, so deleting it would be the platform deciding on their behalf that it
did not matter.

```bash
node -e "require('./src/jobs/taskReminders').run().then(console.log)"
```

`src/jobs/paymentReminders.js` does the same for money: `payment_due_soon` for
instalments falling due within `PAYMENT_REMINDER_LEAD_DAYS` (7 by default) and
`payment_overdue` for ones past their date, both computed from the ledger
(`payment.service.js#settle`) so a schedule the traveller has already paid off
is never chased just because its date has passed.

```bash
node -e "require('./src/jobs/paymentReminders').run().then(console.log)"
```

Run both from cron or Task Scheduler. Computing "overdue" when the bell is
opened instead would be simpler and wrong — a notification that exists only
while you are looking at it has not notified anybody.

---

## Not built

- **No email, SMS or push.** In-app only, by design for this release.
- No per-user preferences for which events reach them. With seventeen event types and
  audiences chosen to be small, a preferences screen would be more machinery than
  the problem needs — and the failure mode of getting it wrong is somebody
  silently switching off the SOS.
- No real-time delivery. The bell polls; see `NotificationBell.jsx` for why a
  websocket was not worth the reconnection path nobody would notice was broken.
