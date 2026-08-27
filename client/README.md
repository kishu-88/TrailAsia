# TrailAsia — Web Client

React single-page application. Serves the **staff portal** (consultants, coordinators, finance,
management) and the **traveller-facing views** (safety, insurance, fair-price guide, booking
details) against the same REST API.

> **Status:** sign-in, session handling and route guards are built. Every business module is
> still folders.

---

## Stack

- **React 18** with **Vite**
- **JavaScript** (JSX), ESM — no TypeScript, by team decision
- **React Router 6** for routing and route guards
- Plain CSS with design tokens in `src/styles/global.css`

---

## Getting it running

```bash
cd client
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm install
npm run dev                    # http://localhost:5173
```

The API must be running on port 4000 — `vite.config.js` proxies `/api` to it, so the browser
sees a single origin in development and the httpOnly refresh cookie behaves exactly as it will
in production. Sign in with the account created by the server's `npm run db:seed`.

---

## Folder guide

| Folder            | What belongs here                                                            |
| ----------------- | ---------------------------------------------------------------------------- |
| `public/`         | Static files copied verbatim to the build output — favicon, robots.txt        |
| `src/assets/`     | Images, icons and fonts imported by components                                |
| `src/components/` | Reusable presentational components with no business logic                     |
| `src/context/`    | React context providers — `AuthContext` today; currency and feature flags later |
| `src/features/`   | One folder per business module; see below                                     |
| `src/hooks/`      | Custom hooks                                                                  |
| `src/pages/`      | Route-level screens that compose features and components                      |
| `src/routes/`     | Router configuration and `ProtectedRoute`                                     |
| `src/services/`   | API client and per-resource wrappers                                          |
| `src/styles/`     | Global stylesheet, CSS variables, spacing and colour tokens                   |
| `src/utils/`      | Pure helpers — date/currency formatting, validation, sorting                  |

### Feature folders

Each folder under `src/features/` corresponds to a module from the business case and owns its own
components, hooks and local state.

| Feature       | Covers                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `bookings/`   | Multi-country itinerary builder, templates, group departures, amendments      |
| `travellers/` | Traveller profiles, passport/visa/insurance records, health declarations, per-destination document checklists |
| `operators/`  | Ground-operator confirmation status for guides, accommodation and logistics   |
| `payments/`   | Multi-currency deposits and instalments, reconciliation against bookings      |
| `safety/`     | Opt-in location sharing, SOS view, insurance verification, fair-price guide, scam alerts |
| `reports/`    | Booking pipeline, demand by destination and season, consultant workload       |

A feature may import from `components/`, `hooks/`, `services/` and `utils/`.
**Features should not import from each other** — if two need the same thing, promote it. That
boundary is what keeps a change to the payment rules from breaking the itinerary screens.

---

## How the session works

Three files, and it is worth reading them in this order:

**`src/services/apiClient.js`** — the only place that calls `fetch`. It holds the access token in
a module variable (**in memory, never `localStorage`**, so injected script cannot read it off
disk) and attaches it as a bearer header. When a request comes back `401 ACCESS_TOKEN_EXPIRED` it
calls `/auth/refresh` once and replays the original request. Concurrent 401s share a single
refresh promise instead of stampeding the endpoint.

**`src/context/AuthContext.jsx`** — holds the signed-in user. On boot it tries `/auth/refresh`,
because the httpOnly refresh cookie survives a page reload even though the access token does not.
It also schedules a renewal a minute before expiry, so a consultant part-way through a long
booking is never interrupted by a failed request.

**`src/routes/ProtectedRoute.jsx`** — redirects anonymous visitors to `/login`, remembering where
they were headed so sign-in can send them back.

`useAuth()` is the only thing a screen needs:

```jsx
import { useAuth } from '../context/AuthContext.jsx';

const { user, isAuthenticated, isLoading, login, logout } = useAuth();
```

Branch on `isLoading` before `isAuthenticated`. Without it, a page refresh briefly looks like a
logged-out user and bounces people to the login screen mid-session.

Calling the API from a feature:

```js
import { api } from '../../services/apiClient.js';

const bookings = await api.get('/bookings');
```

Errors arrive as `ApiError` with `status`, `code` and — on validation failures — a `details`
object keyed by field name, which is what `LoginPage` renders inline.

---

## Conventions

- **Components** — `PascalCase.jsx`, one per file.
- **Hooks and utils** — `camelCase.js`, hooks always start with `use`.
- **API calls** — never `fetch` directly in a component. Go through `src/services/`, so the base
  URL, auth header, refresh logic and error shape live in one place.
- **Currency** — always render an amount with its currency code. The agency handles AUD, NPR,
  BTN, INR and USD; an unlabelled number is a bug waiting to happen.
- **Dates** — the traveller's local timezone for anything about their trip, Sydney time for
  agency operations. Label which one is being shown.
- **Personal data** — passport numbers, health declarations, location coordinates and tokens
  never go into `localStorage`, console logs or URL query strings.

---

## Environment

Copy `.env.example` to `.env.local`. Vite only exposes variables prefixed with `VITE_`, and
**everything exposed reaches the browser** — no secrets here, only the API base URL, feature
flags and publishable keys.

---

## Scripts

| Command           | Does                                     |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Vite dev server on http://localhost:5173 |
| `npm run build`   | Production build into `dist/`            |
| `npm run preview` | Serve the production build locally       |
| `npm run lint`    | ESLint across `src/`                     |
