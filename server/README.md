# TrailAsia — API Server

Node.js + Express REST API backing the staff portal and the traveller app. Owns all business
rules, all database access and all integrations (payment gateway, messaging, after-hours chatbot).

> **Status:** authentication, staff accounts and RBAC, destinations and document
> requirements, travellers and documents, and bookings and itineraries are built and
> covered by tests. Ground operators, payments, tasks, reporting, the safety module and
> the chatbot are still folders.

---

## Stack

- **Node.js 20 LTS** (see `../.nvmrc`)
- **Express** — REST API mounted at `/api/v1`
- **MySQL 8** via **Sequelize** ORM (`mysql2` driver), migrations through `sequelize-cli`
- **CommonJS** (`require`), not ESM — `sequelize-cli` loads config and migration files
  directly, and it is far less trouble in CJS. The client is ESM; the two do not need to match.
- **JWT** access tokens plus rotating opaque refresh tokens
- **zod** for request validation, **bcryptjs** for password hashing

`bcryptjs` rather than `bcrypt` on purpose: it is pure JavaScript, so nobody on the team needs
Visual Studio build tools to `npm install` on Windows.

---

## Folder guide

| Folder             | What belongs here                                                           |
| ------------------ | --------------------------------------------------------------------------- |
| `src/config/`      | `env.js` (validated environment access) and `config.js` (Sequelize CLI config) |
| `src/models/`      | Sequelize model definitions; `index.js` builds the connection and wires associations |
| `src/routes/`      | Express routers — path definitions only, one file per resource               |
| `src/controllers/` | Request handlers. Read the request, call a service, shape the response. No SQL, no rules |
| `src/services/`    | Business logic — auth rules, itinerary rules, reconciliation, SOS escalation |
| `src/middleware/`  | Authentication, role checks, error handling, rate limiting, uploads          |
| `src/validators/`  | zod schemas and the `validateBody` helper, run before the controller         |
| `src/jobs/`        | Scheduled work — location purge, expired-token cleanup, payment reminders    |
| `src/utils/`       | `ApiError`, token helpers, shared formatting                                 |
| `db/migrations/`   | Versioned schema changes, applied in filename order                          |
| `db/seeds/`        | Reference data and the initial administrator                                 |
| `tests/`           | Unit tests for services, integration tests for routes                        |

### Request flow

```
route → validator → middleware (auth) → controller → service → model → MySQL
```

Keep each layer honest. A controller that queries the database, or a model that enforces a
business rule, is the thing that makes this codebase expensive to change later.

---

## Getting it running

```bash
cd server
cp .env.example .env        # Windows: copy .env.example .env
npm install
```

Fill in `.env`. For local development only two values are actually required — `DB_PASSWORD` and
a `JWT_SECRET`:

```bash
# generate a secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The seeded staff accounts fall back to development defaults, so you do not need to set those
before your first run. See **Seeded accounts** below.

Create the database:

```sql
CREATE DATABASE trailasia CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'trailasia_app'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON trailasia.* TO 'trailasia_app'@'localhost';
FLUSH PRIVILEGES;
```

Then:

```bash
npm run db:migrate     # creates every table
npm run db:seed        # staff accounts, destinations and document requirements
npm run dev            # http://localhost:4000/api/v1
```

Check it responds:

```bash
curl http://localhost:4000/api/v1/health
```

---

## Seeded accounts

`npm run db:seed` creates one account per role and prints the credentials. With nothing set in
`.env` you get development defaults:

| Role | Email | Password |
| ---- | ----- | -------- |
| `admin` | `admin@trailasia.local` | `trailasia-dev-password` |
| `coordinator` | `coordinator@trailasia.local` | `trailasia-dev-password` |
| `consultant` | `consultant@trailasia.local` | `trailasia-dev-password` |
| `finance` | `finance@trailasia.local` | `trailasia-dev-password` |

Four accounts rather than one because the roles are the interesting part. Sign in as the
consultant and the Verify button on a traveller's insurance is gone; as finance and the passport
number stays masked and the Staff nav item disappears; only the admin can reach account
management. That is duty separation from Section 8.2, and it is worth seeing rather than reading.

Override any of them with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and the matching
`SEED_COORDINATOR_*`, `SEED_CONSULTANT_*`, `SEED_FINANCE_*`, or set one `SEED_DEFAULT_PASSWORD`
for all four.

**The defaults are refused when `NODE_ENV=production`.** The seeder throws and names the variables
you have to set. A known password in a public repository is only harmless while nothing real sits
behind it, and this project is heading towards passport numbers and health declarations.

Re-running the seeder is safe: an account that already exists is skipped, never overwritten, so a
password someone has since changed is not quietly reset. `npm run db:seed:undo` removes them —
though it will fail once those accounts own bookings, because `bookings.consultant_id` is
`ON DELETE RESTRICT`. That is the right failure; undoing a seeder should not take bookings with it.

---

## Scripts

| Command                | Does                                                     |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Start with nodemon auto-reload                            |
| `npm start`            | Start without reload                                      |
| `npm run db:create`    | Create the database named in `.env`                       |
| `npm run db:migrate`   | Apply pending migrations                                  |
| `npm run db:rollback`  | Revert the most recent migration                          |
| `npm run db:seed`      | Run all seeders                                           |
| `npm run db:seed:undo` | Undo all seeders                                          |
| `npm run db:reset`     | Roll everything back, migrate, seed — **destroys data**   |
| `npm test`             | Run the test suite                                        |
| `npm run test:watch`   | Re-run on change                                          |
| `npm run test:coverage`| Run with a coverage report                                |

`sequelize-cli` is pointed at this project's layout by `.sequelizerc`, so migrations live in
`db/migrations` and seeders in `db/seeds` rather than the CLI's flat defaults.

---

## What is built

Full reference in [`../docs/api/`](../docs/api/README.md) — conventions, then one page per module.

| Area | Base path | Reference |
| ---- | --------- | --------- |
| Sessions | `/auth` | [`auth.md`](../docs/api/auth.md) |
| Staff accounts | `/users` | [`users.md`](../docs/api/users.md) |
| Destinations, document requirements | `/destinations` | [`destinations.md`](../docs/api/destinations.md) |
| Travellers, documents, checklists | `/travellers` | [`travellers.md`](../docs/api/travellers.md) |
| Bookings, itineraries, readiness | `/bookings` | [`bookings.md`](../docs/api/bookings.md) |

Authentication in short: a 15-minute JWT access token held in browser memory, and a 7-day opaque
refresh token in an httpOnly cookie whose SHA-256 hash is stored in `refresh_tokens`. Refresh
tokens rotate on every use; presenting one that has already been rotated away revokes every
session for that user. Five failed sign-ins lock an account for 15 minutes. The design record is
[`adr-001-authentication.md`](../docs/architecture/adr-001-authentication.md).

## Roles

| Role | Can do |
| ---- | ------ |
| `consultant` | Bookings, itineraries, travellers, documents. Sees unmasked passport numbers. |
| `coordinator` | Everything a consultant can, plus destinations, document requirements, and **verifying** documents. |
| `finance` | Read-only across bookings and travellers. Passport numbers stay masked. |
| `admin` | Everything, including staff accounts. |

Two rules here are load-bearing rather than decorative. Document verification is kept away from
consultants, so the person who records an insurance policy is not the person who attests it is
genuine. And passport numbers are masked everywhere except the single-record endpoint, and even
there only for the roles that complete visa applications — finance has no need for them.

Adding a protected route:

```js
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');

router.get('/bookings', authenticate, bookingController.list);
router.post('/bookings', authenticate, requireRole(requireRole.TRIP_EDITORS), bookingController.create);
// req.user is the User instance; req.auth holds the raw JWT claims
```

---

## Tests

```bash
npm test
```

100 tests across auth, users, destinations, travellers and bookings. They run against an
**in-memory SQLite database**, so anyone can clone the repo and run them without installing or
seeding MySQL.

That trade-off is worth stating plainly: SQLite is not MySQL. It ignores `UNSIGNED`, is relaxed
about `ENUM`, and does not enforce column lengths. These tests prove the *application* — request
validation, permissions, business rules, response shapes. They do not prove the MySQL schema is
right. The migrations define the real schema, and `npm run db:migrate` against MySQL is what
proves those.

One consequence showed up immediately and is fixed in `src/utils/money.js`: `mysql2` returns
`DECIMAL` as a string while `sqlite3` returns a number, so the API would have returned
`"8450.50"` in production and `8450.5` in tests. Money columns now go through a getter that
normalises to a fixed two-place string on both.

## Writing a migration

```bash
npx sequelize-cli migration:generate --name create-bookings
```

Never edit a migration that has already run on someone else's machine — add a new one. Include a
working `down` wherever reversal is possible.

MySQL specifics worth holding to:

- **Charset** — `utf8mb4` / `utf8mb4_general_ci` everywhere. Traveller names and destination data
  are not Latin-only.
- **Money** — `DECIMAL(12,2)` plus a separate `CHAR(3)` currency column. Never `FLOAT`. Store the
  exchange rate used on the transaction row rather than recomputing it later.
- **Timestamps** — UTC in the database (`timezone: '+00:00'` in `config.js`), converted at the edges.
- **Foreign keys** — declared explicitly, InnoDB throughout.
- **Location data** — its own table with a trip reference and an expiry, so the purge job can
  delete it cleanly when a trip ends.

---

## Error handling

Throw an `ApiError` for anything the caller should see:

```js
const ApiError = require('../utils/ApiError');

if (!booking) throw ApiError.notFound('Booking not found.');
```

Anything else that escapes is treated as a bug: logged in full, reported as a bare 500. Every
response uses the same envelope, `{ "data": … }` or `{ "error": { message, code, details? } }`,
so the client only ever needs one way to read a result.

---

## Security requirements

From Section 8.2 of the business case. Treat these as acceptance criteria, not suggestions.

| Requirement                                              | State                                    |
| -------------------------------------------------------- | ---------------------------------------- |
| Passwords hashed with a slow, salted algorithm            | Done — bcrypt, cost 12                    |
| Session tokens not readable by page scripts               | Done — httpOnly cookie, in-memory access token |
| Brute-force protection                                    | Done — per-account lockout + per-IP limit |
| Multi-factor authentication for staff accounts            | **Not built** — next auth task            |
| Permissions by role, separating booking/finance/admin     | Done — `requireRole`, enforced per route  |
| Personal data minimised in responses                      | Done — passport masking, hash never serialised |
| TLS 1.3 in transit, AES-256 at rest, key rotation         | Deployment concern                        |
| Location data: consent first, purpose-limited, auto-deleted | With the safety module                  |
| Payments via a PCI DSS-compliant gateway, no card storage | With the payments module                  |
| Upload type restrictions and scanning                     | With the traveller CRM                    |
| Consolidated audit log with alerting                      | **Not built**                             |
| Independent security testing before release               | Delivery gate                             |
| Breach-response plan (Notifiable Data Breaches scheme)    | Documentation task                        |
| Essential Eight baseline (ASD, 2023)                      | Ongoing                                   |

---

## Environment

`.env` is git-ignored and must stay that way. If a secret is ever committed, rotate it — deleting
the commit is not enough, because the value is already in everyone's clone.
