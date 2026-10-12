# Tasks and handovers API

Base path: `/api/v1/tasks`

The shared work queue. The business case describes the problem it solves: nobody
can see a booking's true state without asking the consultant who owns it, because
the work lives in one person's memory, their inbox and a WhatsApp thread.

Two things here are worth reading before using the endpoints.

**Generated tasks.** The document checklist already knows a visa is outstanding
and due in nine days. Making somebody read that and then type it into a task list
is asking a person to do a computer's job badly. `POST /bookings/:id/tasks/sync`
turns readiness gaps into tasks and closes them again when the gap is filled.

**Events.** Every assignment, status change and note is appended to a trail in
the same transaction as the change. A handover that is not recorded is a
conversation, and a conversation is what this module replaces.

---

## Roles

| Action | Roles |
| --- | --- |
| Read the queue, a task, its events, somebody's workload | `consultant`, `coordinator`, `finance`, `admin` |
| Create, edit, assign, change status, add notes, sync, hand over | `consultant`, `coordinator`, `admin` |
| **Be assigned a task** | `consultant`, `coordinator`, `admin` |

Finance reads the queue because "what is still outstanding on this departure" is
a reconciliation question as much as an operational one, and a finance officer
who has to ring a consultant to find out is the exact friction this removes.
Finance cannot be *given* work: assigning to one returns
`400 ROLE_NOT_ASSIGNABLE`.

## Statuses

`open` · `in_progress` · `blocked` · `done` · `cancelled`

Open means the first three. `done` and `cancelled` are terminal — there is no
transition out of either, and `400 INVALID_TASK_TRANSITION` says so. Reopening a
finished task would quietly rewrite what happened; raise a new one and both facts
stay on the record. (The one exception is the generator reopening its own task,
described below, which writes an event saying exactly that.)

`blocked` requires a `blockedReason`. Blocked with no reason is indistinguishable
from abandoned, and it is the state most likely to still be there in a month.

---

## `GET /tasks`

| Parameter | Notes |
| --- | --- |
| `status` | `open` (default — the three live states), `all`, or one exact status |
| `assignedTo` | `me`, `unassigned`, or a user id |
| `overdue` | `true` — open and past its due date |
| `bookingId` · `travellerId` · `category` · `priority` | Exact match |
| `dueBefore` | `YYYY-MM-DD` |
| `q` | Searches title and description |
| `page` · `perPage` · `sort` | Sortable: `dueOn`, `createdAt`, `priority`, `status`, `title` |

Default order is soonest due first, **undated work last**, urgent above the rest
on the same date. Both halves are `CASE` expressions rather than plain column
sorts: an ENUM sorts by declaration order in MySQL and alphabetically in SQLite,
and a NULL due date sorts *first* ascending in both — which would put everything
without a deadline at the top of a screen whose entire purpose is deadlines.

```jsonc
{ "data": [ {
  "id": "14", "title": "Tourist visa — Ang Dorje",
  "booking": { "id": "7", "reference": "TA-2026-0007", "title": "Everest Base Camp trek" },
  "traveller": { "id": "3", "fullName": "Ang Dorje" },
  "category": "documents", "status": "open", "isOpen": true,
  "allowedNextStatuses": ["in_progress", "blocked", "done", "cancelled"],
  "priority": "high", "dueOn": "2026-09-26", "daysUntilDue": 9, "overdue": false,
  "assignee": null, "source": "readiness", "sourceKey": "readiness:3:2"
} ], "meta": { "page": 1, "perPage": 25, "total": 3, "totalPages": 1 } }
```

`daysUntilDue` and `overdue` are computed on the server so the queue, the
dashboard and the booking panel cannot disagree about what is late today.

## `GET /tasks/summary`

```json
{ "data": { "mine": 4, "mineOverdue": 1, "mineDueToday": 2,
            "unassigned": 3, "open": 11, "overdue": 2 } }
```

`unassigned` sits next to `mine` deliberately. Work nobody owns is the failure a
shared queue exists to expose, and it is invisible on a screen that only ever
shows you your own list.

## `POST /tasks`

```jsonc
{ "bookingId": "7", "title": "Confirm the Lukla flights",
  "description": "…", "category": "operator", "priority": "high",
  "dueOn": "2026-10-01", "travellerId": null, "assignedToUserId": null }
```

Only `bookingId` and `title` are required. `400 TRAVELLER_NOT_ON_BOOKING` if the
traveller is not in the party.

## `PATCH /tasks/:id`

Title, description, category, priority, due date, traveller. `400 TASK_CLOSED`
once the task is finished or cancelled.

## `POST /tasks/:id/assign`

```json
{ "userId": "5", "note": "Vishal is across this operator." }
```

`userId: null` releases it back to the unassigned queue — a legitimate move, and
not the same as cancelling it.

## `POST /tasks/:id/status`

```json
{ "status": "blocked", "blockedReason": "Waiting on the operator to confirm seats." }
```

`done` records who closed it and when. Unblocking clears the reason.

## `POST /tasks/:id/notes` · `GET /tasks/:id/events`

Notes live in the same table as the rest of the trail. A note and a reassignment
are the same kind of thing to a reader — one chronological thread on the task —
and splitting them would mean interleaving two queries to show it.

```jsonc
{ "data": [
  { "type": "created", "actor": null, "note": "Raised automatically from the document checklist.", "createdAt": "…" },
  { "type": "assigned", "actor": { "fullName": "Bibek Chaudhary" }, "fromValue": null, "toValue": "Bibek Chaudhary", "createdAt": "…" },
  { "type": "status_changed", "actor": { "fullName": "Bibek Chaudhary" }, "fromValue": "open", "toValue": "done", "createdAt": "…" }
] }
```

`actor: null` means the platform did it, and the client renders it as such rather
than attributing it to whoever happened to trigger the run.

---

## `POST /bookings/:bookingId/tasks/sync`

Turns the booking's outstanding **mandatory** requirements into tasks, and closes
generated tasks whose gap has been filled.

```json
{ "data": { "created": 2, "updated": 0, "closed": 1, "reopened": 0,
            "booking": { "…": "…" }, "summary": { "…": "…" } } }
```

Idempotent. `sourceKey` (`readiness:<travellerId>:<requirementId>`) identifies
the *gap*, not the run, so calling this every morning produces the same queue it
produced yesterday plus whatever actually changed. `400 NO_ITINERARY` if the
booking has no segments — requirements come from the destinations visited.

Due dates come from the checklist (departure minus the requirement's lead time),
and priority follows: `urgent` when already overdue, `high` within 14 days.

**What it does not touch on an existing task:** the assignee, a status a person
set, or any note they added. A generated task is a prompt, not something the
platform owns; once somebody has picked it up, the platform's job is to keep the
due date honest and then get out of the way.

**Reopening.** If a gap comes back — a visa expires, a verified document is
edited and loses its tick — the generator reopens its own closed task and writes
an event saying so. People cannot reopen a finished task, and that rule is about
people rewriting history; this is the platform reporting a fact that is true
again, in the open.

---

## Handover

### `GET /tasks/workload/:userId`

What somebody is currently carrying — the preview shown before anything moves.

```json
{ "data": { "user": { "…": "…" }, "total": 7, "overdue": 2, "bookings": 3, "tasks": [ … ] } }
```

### `POST /tasks/handover`

```json
{ "fromUserId": "4", "toUserId": "5", "bookingId": null,
  "note": "Kishor is on leave until the 30th." }
```

Moves every **open** task from one person to another and writes a `handover`
event on each. `bookingId` scopes it to a single trip when only that trip is
changing hands.

Closed tasks are never included: a handover is about work still to do, and
rewriting who finished something last month would be a lie in a record other
people rely on.

`400 HANDOVER_NO_OP` for the same person; `400 ROLE_NOT_ASSIGNABLE` for finance.

---

## Not built

- **Nothing notifies anybody.** The queue helps whoever opens it; a task that is
  overdue does not email its owner. That needs the same messaging provider the
  safety module's on-call paging needs, and the agency has not chosen one.
- No recurring tasks, no templates per destination, no dependencies between
  tasks. All three are easy to add and none of them are the problem the module
  was built for.
