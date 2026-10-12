# TrailAsia

**Travel Operations and Traveller Safety Platform**
A digital service proposal for *Himalayas Travel and Tour*, Sydney.

> PRT631 — Information Systems Practice · Charles Darwin University, Sydney campus
> Kishor Aryal (s394008) · Bibek Kumar Chaudhary (s395751) · Vishal Rawat (s394591) · Pratik Thapa Magar (s395120)

---

## What this repository is

Himalayas Travel and Tour runs trekking expeditions in Nepal, Bhutan and Tibet and is expanding
across Asia. Today its bookings, traveller documents, ground-operator confirmations and payments
live in spreadsheets, email chains and WhatsApp threads. Nothing connects, nobody can see a
booking's true state without asking the consultant who owns it, and once a group leaves Australia
the agency loses sight of them entirely.

TrailAsia is the platform that fixes both halves of that problem:

- a **staff portal** that holds bookings, itineraries, traveller records, ground-operator
  coordination, multi-currency payments and reporting in one place; and
- a **traveller-facing app** offering opt-in location sharing and one-tap SOS, stored insurance
  details with altitude cover, a locally-sourced fair-price guide, and scam alerts.

The safety half is what makes a tailored build worth doing rather than buying an off-the-shelf
tour-operator product — it cannot be bought, and it addresses documented risk (roughly one in
three Australian consular cases occur in Southeast Asia; Nepal prosecuted 32 people over
helicopter-rescue insurance fraud in April 2026).

> **Status.** The API covers authentication, staff accounts and role-based access,
> destinations and document requirements, travellers and their documents, bookings and
> itineraries, traveller sign-in, the safety module — location consent, position sharing
> and SOS — a shared task queue with handovers, in-app notifications, ground-operator
> coordination, multi-currency payment tracking with a due-date/overdue reminder sweep,
> and a reporting dashboard. The React client has every staff screen for those modules, a
> safety desk, a task queue, a notification bell in the top bar, and a traveller app
> behind the traveller's own sign-in. The after-hours chatbot is not started. Payments is
> a manual ledger only — there is no online gateway yet, so a traveller cannot pay an
> instalment themselves — and notifications are in-app only, nothing pages a phone that
> is not already looking at the screen.

---

## TrailAsia Book — the public booking site

A stranger who wants to enquire about a trip does not get a staff account. That surface
lives in a **separate repository**, `../TrailAsia-Book`, with its own client and server,
so it ships to the public internet on its own domain without carrying any staff-only code.
It has no database of its own — it talks to this API's `/api/v1/public/*` routes (see
[`docs/api/public.md`](docs/api/public.md)), which create a normal `enquiry`-stage booking
in the same pipeline staff already work from. Traveller sign-in for someone who already has
a confirmed booking reuses this API's existing traveller sessions rather than a second
identity system.

---

## Technology stack

| Layer      | Choice                                  | Notes                                                         |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| Frontend   | React 18 (Vite), JavaScript, ESM        | Staff portal SPA; traveller views share the same API           |
| Backend    | Node.js + Express, JavaScript, CommonJS | REST API under `/api/v1`. CJS because `sequelize-cli` prefers it |
| Database   | MySQL 8 via Sequelize ORM               | Relational — bookings, payments and reconciliation need joins  |
| Migrations | `sequelize-cli`                         | Versioned files in `server/db/migrations`                      |
| Auth       | JWT access token + rotating refresh cookie | Two scopes: staff (consultant, coordinator, finance, admin) and traveller |
| Payments   | External PCI DSS-compliant gateway      | The API never stores full card numbers                         |
| Node       | 20 LTS (see `.nvmrc`)                   |                                                               |

---

## Repository layout

```
TrailAsia/
├── client/                 React single-page app (staff portal + traveller views)
│   ├── public/             Static assets served as-is
│   └── src/
│       ├── assets/         Images, icons, fonts
│       ├── components/     Reusable presentational components
│       ├── context/        React context providers (auth, theme, currency)
│       ├── features/       One folder per business module
│       │   ├── bookings/       Booking & itinerary building
│       │   ├── tasks/          Shared work queue, task trail, handovers
│       │   ├── travellers/     Traveller CRM, documents, health declarations
│       │   ├── operators/      Ground-operator confirmations
│       │   ├── payments/       Multi-currency deposits and instalments
│       │   ├── traveller/      The traveller's own screens — trip, documents, safety
│       │   ├── safety/         (staff-side safety screens live in pages/SafetyPage.jsx)
│       │   └── reports/        Pipeline, demand by destination, workload
│       ├── hooks/          Custom React hooks
│       ├── pages/          Route-level screens
│       ├── routes/         Router configuration and route guards
│       ├── services/       API client wrappers (one file per resource)
│       ├── styles/         Global styles and design tokens
│       └── utils/          Formatting, validation and other helpers
│
├── server/                 Node.js + Express REST API
│   ├── db/
│   │   ├── migrations/     Versioned MySQL schema changes (sequelize-cli)
│   │   └── seeds/          Seeders — initial admin, later reference data
│   ├── src/
│   │   ├── config/         env.js (validated env access), config.js (Sequelize CLI)
│   │   ├── controllers/    Request handlers — thin, no business logic
│   │   ├── jobs/           Scheduled work (location purge, payment reminders)
│   │   ├── middleware/     Auth, error handling, rate limits, uploads
│   │   ├── models/         Sequelize models — database access lives here
│   │   ├── routes/         Route definitions mounted under /api/v1
│   │   ├── services/       Business logic and rules
│   │   ├── utils/          ApiError, token helpers, shared formatting
│   │   └── validators/     zod request schemas
│   └── tests/              Unit and integration tests
│
├── docs/                   Project documentation
│   ├── api/                Endpoint contracts
│   ├── architecture/       Diagrams, data model, decision records
│   ├── business-case/      Assignment 1 business case and supporting material
│   └── meetings/           Team meeting notes
│
├── .editorconfig           Shared editor settings
├── .gitattributes          Line-ending and binary-file rules
├── .gitignore              Ignore rules for the whole monorepo
└── .nvmrc                  Node version
```

Each module in `client/src/features/` mirrors a module in the business case (Table 2), and each
one maps to a matching route/controller/service/model set on the server. Keeping that alignment
is deliberate — it is the "high cohesion, low coupling" principle from Section 4.4 of the
business case, and it is what makes the payments rules changeable without touching scheduling.

---

## Quick start (Windows)

Two plain batch files sit in this folder — no PowerShell, so there is no execution-policy prompt
to fight with. Double-click from Explorer, or run from cmd. Run the first once, the second every
time.

```
setup.bat      REM one-time: installs both halves, writes server\.env, migrates, seeds
start.bat      REM every day: opens the API and client, each in its own window
```

`setup.bat` asks for your MySQL password, generates a `JWT_SECRET` for you, and stops with the
exact `CREATE DATABASE` statement if the database does not exist yet. Unlike a PowerShell prompt,
plain `cmd` has no masked input, so the password is echoed to the screen as you type it — it is
written into `server\.env` either way, and that file is git-ignored and stays on this machine. See
the comment at the top of `setup.bat` for the handful of characters to avoid in that password
(batch's string handling doesn't round-trip `%`, `^`, `&`, `|`, `<`, `>`, `"` or `!` reliably); if
your MySQL password already has one of those, skip the prompt and copy `server\.env.example` to
`server\.env` by hand instead.

`start.bat` opens the API and the client together, each in its own window, then polls both
`/health`-equivalent endpoints in the background until both answer before opening the browser tab.
It is also safe to run twice: if something is already listening on a port, it's checked — not just
assumed — to actually be the right process before being left alone. A port held by something else,
or by a process orphaned from a previous run whose window was closed without stopping it, fails
loudly with the `netstat`/`taskkill` command to clear it, rather than silently skipping that window.

Prefer to drive it by hand, or not on Windows? The full steps are below.

---

## Getting started

**Prerequisites**

- Node.js 20 LTS (`nvm use` picks it up from `.nvmrc`)
- MySQL 8 running locally
- Git

**Setup**

```bash
git clone <repository-url>
cd TrailAsia

# API
cd server
cp .env.example .env          # Windows: copy .env.example .env
npm install
npm run db:migrate
npm run db:seed               # staff accounts, destinations, document requirements
npm run dev                   # http://localhost:4000

# Web client (in a second terminal)
cd ../client
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

Before `npm run db:migrate`, fill in two values in `server/.env` — `DB_PASSWORD` and a
`JWT_SECRET`. Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Signing in.** `npm run db:seed` creates one account per role and prints the credentials. With
nothing else set, they are `admin@trailasia.local`, `coordinator@trailasia.local`,
`consultant@trailasia.local` and `finance@trailasia.local`, all with the password
`trailasia-dev-password`. Sign in as each to see how the interface changes — the roles are the
interesting part. These development defaults are refused when `NODE_ENV=production`; details in
[`server/README.md`](server/README.md#seeded-accounts).

**Database**

```sql
CREATE DATABASE trailasia CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'trailasia_app'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON trailasia.* TO 'trailasia_app'@'localhost';
FLUSH PRIVILEGES;
```

Use `utf8mb4` throughout — traveller names and destination data include non-Latin scripts.
Store money as `DECIMAL(12,2)` with a separate currency column, never as a float.

Then open http://localhost:5173 and sign in with the seeded administrator.

---

## The API

Conventions and per-module reference: [`docs/api/`](docs/api/README.md)

| Area | Base path | Covers |
| ---- | --------- | ------ |
| Sessions | `/auth` | Sign in, rotate, sign out, change password |
| Staff accounts | `/users` | Admin-managed accounts, deactivation, lockout recovery |
| Destinations | `/destinations` | Countries served, and the documents each one requires |
| Travellers | `/travellers` | Profiles, passports, visas, insurance, health declarations, per-trip checklists |
| Bookings | `/bookings` | Multi-country itineraries, party management, document readiness |
| Tasks | `/tasks` | Shared work queue, generated document chasers, handovers |
| Notifications | `/notifications` | The top-bar bell — per-person, in-app only |
| Traveller portal | `/auth/traveller`, `/me` | Traveller sign-in, their own trip and documents |
| Safety | `/safety` | Location consent, position sharing, SOS alerts and their handling |
| Ground operators | `/operators` | Operators per destination, and their confirmations against a booking |
| Payments | `/payments` | Instalment plans, the ledger, reconciliation, a due-date/overdue reminder sweep |
| Reporting | `/reports` | Pipeline, demand by destination, workload — role-based |

Two endpoints are worth singling out, because they are where the platform stops being a
filing cabinet:

**`GET /travellers/:id/document-checklist`** answers *what is outstanding for this person,
for this trip, and by when* — comparing what a destination requires against what the
traveller actually holds, including whether a passport clears the six-month validity
window and whether an insurance policy's altitude limit covers the itinerary.

**`GET /bookings/:id/readiness`** runs that across the whole party against every
destination the itinerary visits. That is the fourteen-days-out report, in one call.

The altitude check is deliberate. A traveller can hold a real, unexpired, verified policy
and still be unprotected on a 5,364m pass if the policy stops at 4,000m — the gap the
Nepal helicopter-evacuation fraud in Section 2.2 exploited. The checklist will not go
green until the limit is recorded, clears the itinerary, and there is an insurer number
to ring.

**Roles.** `consultant` sells and plans · `coordinator` runs departures and verifies
documents · `finance` reads for reconciliation · `admin` manages accounts. Document
verification is kept away from consultants so the person recording an insurance policy is
not the person attesting it is genuine, and passport numbers are masked everywhere except
the single-record endpoint, and even there only for roles that complete visa applications.

**Tasks.** A booking's outstanding documents become tasks by themselves —
`POST /bookings/:id/tasks/sync` reads the same readiness check the coordinator
does and raises one task per gap, closing them again when the document arrives.
It is idempotent, keyed on the gap rather than the run, and it will not touch the
assignee or status a person has set: a generated task is a prompt, not something
the platform owns. `POST /tasks/handover` moves one person's open work to
another in a single step with a reason recorded against every task that moves,
which is the leave-and-illness case the business case describes — the one that
currently happens verbally and is lost. Full reference:
[`docs/api/tasks.md`](docs/api/tasks.md).

**Payments.** Instalment plans and the ledger are deliberately separate — a
schedule row never records how much of it has been paid, that is always
answered by reading `Payment` rows through `payment.service.js#settle`, so the
plan and the money can never drift apart. `server/src/jobs/paymentReminders.js`
runs that same settlement logic daily and raises `payment_due_soon` for
instalments falling due within `PAYMENT_REMINDER_LEAD_DAYS` (7 by default) and
`payment_overdue` for ones already past their date and still unpaid — both go
to the booking's consultant and coordinator plus everyone in finance, and both
dedupe on the instalment's current due date, so pushing a plan out and missing
the new date too raises a fresh nudge rather than staying silent.

**Notifications.** An SOS reaches every trip editor's bell the moment it is
raised; a task assigned to you, a document your coordinator verified, a booking
somebody cancelled and a task of yours gone overdue all land in the same place.
Two rules hold throughout: raising a notification can never break the thing that
caused it — a failed insert is logged and swallowed, and there is a test that
proves an SOS still succeeds when notifications are broken — and nobody is ever
told what they just did. In-app only, deliberately:
[`docs/api/notifications.md`](docs/api/notifications.md).

**Safety.** `POST /safety/me/sos` is the one endpoint in this API that refuses
nothing: no consent requirement, no rate limit, and only a booking id is required,
because a phone with no fix and four seconds of battery must still be able to raise
an alert. Location sharing is the opposite — off until the traveller turns it on for
that specific trip, and purged 30 days after the trip ends by
`server/src/jobs/purgeLocations.js`. The position captured when SOS is pressed is
attached to the incident record, not stored as tracking: pressing SOS is consent to
be found, not consent to be followed. Reasoning:
[`docs/architecture/adr-002-traveller-sessions-and-location-data.md`](docs/architecture/adr-002-traveller-sessions-and-location-data.md).

**Sessions.** A 15-minute JWT access token held in browser memory, paired with a 7-day
opaque refresh token in an httpOnly cookie whose SHA-256 hash is stored server-side.
Neither is readable by script on the page. Refresh tokens rotate on every use; presenting
one already rotated away is treated as theft and revokes every session for that user.
Reasoning: [`docs/architecture/adr-001-authentication.md`](docs/architecture/adr-001-authentication.md).

Accounts are created by an administrator — there is no public sign-up, for staff or
travellers. A traveller is invited from their own record by the consultant running
the trip; the invitation link is shown once and only its hash is stored, and the
consultant passes it on themselves because there is no mail transport yet. Every
token carries a `scope` claim and the two audiences have separate guards — staff and
travellers are numbered in different tables, so a token without a scope would resolve
against whichever table the route happened to read. MFA remains the outstanding
Section 8.2 commitment.

---

## Tests

```bash
cd server && npm test
```

310 tests across auth, traveller auth, users, destinations, travellers, bookings,
safety, tasks, notifications, operators, payments (including the due-date and
overdue reminder sweep) and reports, running against an
in-memory SQLite database so no MySQL setup is needed. They prove the application logic —
validation, permissions, business rules, response shapes. The migrations define the real
MySQL schema and are proved by running `npm run db:migrate` against it.

---

## Release 1 scope

**In:** booking and itinerary management · traveller CRM with per-destination document
checklists · ground-operator coordination for the pilot destination · multi-currency payment
tracking · traveller app with safety, insurance and fair-price features · after-hours chatbot for
routine questions · reporting dashboard with role-based access.

**Built so far:** bookings and itineraries · traveller CRM with per-destination
document checklists · traveller sign-in and self-service trip view · location consent,
position sharing and SOS with a staff safety desk · a shared task queue with
document chasers generated from readiness, and handovers · in-app notifications ·
ground-operator coordination for the pilot destination · multi-currency payment
tracking with instalment plans, reconciliation and a due-date/overdue reminder sweep ·
a role-based reporting dashboard.

**Out (deferred):** public self-service booking portal · automated supplier contracting ·
replacing the agency's accounting software · satellite messaging hardware · a chatbot that
handles emergencies (escalation to a human is mandatory) · demand forecasting.

---

## Working agreement

- **Branches** — `main` is protected. Work on `feature/<short-description>`,
  `fix/<short-description>` or `docs/<short-description>`.
- **Commits** — conventional style: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- **Pull requests** — one reviewer from another team member before merge.
- **Secrets** — `.env` files are ignored by git and must stay that way. If a credential is ever
  committed, rotate it rather than only deleting it.
- **Privacy** — location, passport, health and payment data are covered by the Privacy Act 1988.
  Location records are purged after a trip ends (`LOCATION_RETENTION_DAYS`). Do not add a feature
  that stores personal data without noting it in `docs/architecture/`.

---

## Documentation

| Document                     | Where                       |
| ---------------------------- | --------------------------- |
| Business case (Assignment 1) | `docs/business-case/`       |
| Architecture and data model  | `docs/architecture/`        |
| API conventions              | `docs/api/README.md`        |
| API reference, per module    | `docs/api/`                 |
| Team meeting notes           | `docs/meetings/`            |
| Frontend conventions         | `client/README.md`          |
| Backend conventions          | `server/README.md`          |

---

## Academic note

Himalayas Travel and Tour is a hypothetical organisation created for this assignment. Market,
regulatory and traveller-risk information is drawn from published sources and is real;
organisational details and all financial values are planning assumptions.
