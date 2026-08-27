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
> destinations and document requirements, travellers and their documents, and bookings
> and itineraries — 100 passing tests. The React client has sign-in and session handling;
> its module screens are still to come. Ground operators, payments, tasks, reporting, the
> traveller safety module and the chatbot are not started.

---

## Technology stack

| Layer      | Choice                                  | Notes                                                         |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| Frontend   | React 18 (Vite), JavaScript, ESM        | Staff portal SPA; traveller views share the same API           |
| Backend    | Node.js + Express, JavaScript, CommonJS | REST API under `/api/v1`. CJS because `sequelize-cli` prefers it |
| Database   | MySQL 8 via Sequelize ORM               | Relational — bookings, payments and reconciliation need joins  |
| Migrations | `sequelize-cli`                         | Versioned files in `server/db/migrations`                      |
| Auth       | JWT access token + rotating refresh cookie | Roles: consultant, coordinator, finance, admin              |
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
│       │   ├── travellers/     Traveller CRM, documents, health declarations
│       │   ├── operators/      Ground-operator confirmations
│       │   ├── payments/       Multi-currency deposits and instalments
│       │   ├── safety/         Location sharing, SOS, insurance, fair-price guide
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
npm run db:seed               # creates the first admin from SEED_ADMIN_* in .env
npm run dev                   # http://localhost:4000

# Web client (in a second terminal)
cd ../client
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:5173
```

Before `npm run db:migrate`, fill in `.env`: `DB_PASSWORD`, a `JWT_SECRET`, and
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (minimum 12 characters). Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Database**

```sql
CREATE DATABASE trailasia CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
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

**Sessions.** A 15-minute JWT access token held in browser memory, paired with a 7-day
opaque refresh token in an httpOnly cookie whose SHA-256 hash is stored server-side.
Neither is readable by script on the page. Refresh tokens rotate on every use; presenting
one already rotated away is treated as theft and revokes every session for that user.
Reasoning: [`docs/architecture/adr-001-authentication.md`](docs/architecture/adr-001-authentication.md).

Accounts are created by an administrator — there is no public sign-up. MFA remains the
outstanding Section 8.2 commitment.

---

## Tests

```bash
cd server && npm test
```

100 tests across auth, users, destinations, travellers and bookings, running against an
in-memory SQLite database so no MySQL setup is needed. They prove the application logic —
validation, permissions, business rules, response shapes. The migrations define the real
MySQL schema and are proved by running `npm run db:migrate` against it.

---

## Release 1 scope

**In:** booking and itinerary management · traveller CRM with per-destination document
checklists · ground-operator coordination for the pilot destination · multi-currency payment
tracking · traveller app with safety, insurance and fair-price features · after-hours chatbot for
routine questions · reporting dashboard with role-based access.

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
