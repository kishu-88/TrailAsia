# TrailAsia — Web Client

React single-page application. Serves the **staff portal** (consultants, coordinators, finance,
management) and the **traveller-facing views** (safety, insurance, fair-price guide, booking
details) against the same REST API.

> **Status:** sign-in, dashboard, bookings, travellers, destinations and staff admin are built,
> with working create/edit forms throughout. Ground operators, payments, tasks, reporting and the
> traveller safety module are not started.

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
| `src/components/common/` | The shared kit — `Button`, `Card`, `DataTable`, `Field`, `Modal`, `Badge`, `Pagination`, `EmptyState`, `ErrorNotice`, `Spinner` |
| `src/components/layout/` | `AppLayout` (sidebar + top bar), `Sidebar`, `PageHeader`               |
| `src/context/`    | `AuthContext` (session) and `ToastContext` (brief confirmations)              |
| `src/features/`   | One folder per business module; see below                                     |
| `src/hooks/`      | `useAsync` (one call) and `useList` (paginated, filtered list)                |
| `src/pages/`      | Route-level screens that compose features and components                      |
| `src/routes/`     | Router configuration and `ProtectedRoute`                                     |
| `src/services/`   | API client and per-resource wrappers                                          |
| `src/styles/`     | Global stylesheet, CSS variables, spacing and colour tokens                   |
| `src/utils/`      | `format.js` (dates, money, labels) and `permissions.js` (role checks)         |

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

### Two sessions, not one

There is a second session for travellers, in `TravellerAuthContext` / `TravellerRoute`, and
`apiClient` keeps the two tokens in **separate slots** rather than one "current token".

A consultant checking what their traveller sees holds both at once, and a single slot would mean
whichever they used last silently signed them out of the other. Each slot refreshes against its
own endpoint and its own cookie. Traveller calls go through `travellerApi` (or `{ scope:
'traveller' }`); everything else defaults to the staff slot, so no existing service changed.

```js
import { travellerApi } from '../../services/apiClient.js';
const trip = await travellerApi.get('/me/trips/12');
```

The traveller provider is mounted by `routes/TravellerSession.jsx` around the `/trip` routes only
— putting it in `main.jsx` next to the staff one would fire a traveller refresh on every staff
page load, for a session nobody on that screen is using.

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
object keyed by field name. Every form maps those straight onto its fields, so a rejected
`returnDate` appears under the return date rather than as a banner the user has to decode.

**`apiClient` returns the whole envelope**, not `payload.data`. Unwrapping here would read more
nicely at the call site but would silently drop `meta`, and a list screen that loses its
pagination looks exactly like an empty database — which is precisely the bug that showed up the
first time this was wired up. The services in `src/services/` do the unwrapping, since they are
the layer whose job is knowing the API's shape.

## Screens

| Route | What it does |
| ----- | ------------ |
| `/` | Dashboard — next departures, open enquiries |
| `/bookings` | Pipeline list with status, search and departure filters |
| `/bookings/:id` | Detail: status workflow, itinerary builder, party, document readiness |
| `/travellers` | Directory, with a passport-expiry warning under six months |
| `/travellers/:id` | Profile, documents, verification, and an ad-hoc checklist runner |
| `/destinations` | Reference data list |
| `/destinations/:id` | Detail and the document requirements that drive every checklist |
| `/tasks` | The shared work queue — mine, overdue, unassigned, everything open; handovers |
| `/safety` | Safety desk — open SOS alerts, acknowledge and close. Every staff role can read it |
| `/staff` | Admin only — accounts, deactivation, password reset |

### The top bar

`NotificationBell.jsx` polls `/notifications/unread-count` every 60 seconds and only fetches
the list when the panel is opened — a closed bell costs a count, not a feed. It fails quietly:
if the API is unreachable the bell shows nothing rather than putting an error on every screen.

### The traveller app

| Route | What it does |
| ----- | ------------ |
| `/trip/sign-in` | Traveller sign-in — phone-shaped, separate from the staff `/login` |
| `/trip/activate?token=…` | Set a password from an invitation link |
| `/trip` · `/trip/:bookingId` | Their trip, documents, safety and help |
| `/preview/trip/:bookingId/:travellerId` | Staff preview of the above, with the safety controls **inert** |

The preview is not a smaller version of the traveller app — it is the same components reading the
staff API, and the SOS and consent controls are deliberately dead in it. A consultant must not be
able to consent to location sharing, or raise a real alert, on somebody else's behalf. `TripSafety`
takes a `live` prop and renders `SafetyControls` only under a traveller's own session.

## State and data fetching

Two hooks cover nearly everything:

- **`useAsync(fn, deps)`** — one call, with `data`, `loading`, `error` and `reload`. Ignores a
  resolution that lands after the component unmounts.
- **`useList(fetcher, { initialFilters })`** — a paginated, filtered list. Resets to page 1 when
  a filter changes, because filtering down to three results while sitting on page 4 shows an
  empty screen and looks like a bug.

There is no global store. Screens own their data and pass it down; the only shared state is the
session and the toast queue. Add one when two distant screens genuinely need the same live data,
not before.

## Permissions

`utils/permissions.js` mirrors `server/src/middleware/requireRole.js` and decides what the
interface *offers* — which buttons render, which nav items appear. It is a courtesy, not a
security control: anyone can edit those values in their browser, and doing so earns them a 403.
The server checks every request independently. **If a rule changes, change the server first.**

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
