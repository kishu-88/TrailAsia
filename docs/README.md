# TrailAsia — Documentation

Everything written about the project that is not code.

| Folder           | Contents                                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| `business-case/` | Assignment 1 business case and supporting source material                      |
| `architecture/`  | System diagrams, MySQL data model, decision records, privacy design            |
| `api/`           | Endpoint contracts — request and response shapes, status codes, error format   |
| `meetings/`      | Team meeting notes, one file per meeting                                       |

> Move `PRT631_Assignment1_Business_Case_TrailAsia.docx` from the repository root into
> `business-case/` — it is kept at the root for now so nothing is moved without asking.

---

## What to write, and when

**Architecture decision records** (`architecture/adr-NNN-short-title.md`) — write one whenever the
team makes a call that would be expensive to reverse: the database choice, how location data is
retained, whether the chatbot ever handles emergencies. Keep them short — context, decision,
consequences. The value is that a future reader learns *why*, not just *what*.

**API contracts** (`api/<resource>.md`) — write the contract before building the endpoint, so the
client and server halves of the team can work in parallel without guessing at each other's shapes.

**Meeting notes** (`meetings/YYYY-MM-DD.md`) — decisions and who owns what next. Not a transcript.

---

## Traceability

The business case commits to specific claims, and the build should be able to point back at them.
Worth keeping visible as work starts:

| Business case section | What it constrains                                                          |
| --------------------- | --------------------------------------------------------------------------- |
| 4.2, Table 2          | The module list — the feature folders in `client/src/` mirror it              |
| 4.3                   | The four elements of the safety module: location/SOS, fair price, insurance verification, scam alerts |
| 4.4                   | Module boundaries, offline tolerance in poor mountain coverage, privacy by design |
| 5.1, Table 7          | Release 1 boundary — what is in and what is deferred                          |
| 6.1, Table 10         | The 20-week delivery schedule and its go/no-go gates                          |
| 8.2                   | Privacy Act 1988 obligations and the Essential Eight security baseline        |

Two gates from Section 6.1 deserve flagging early: the build phase cannot begin until discovery
validates the financial estimates, and the pilot cannot begin until the chatbot's safety
escalation has been tested against deliberately constructed emergency scenarios.

---

## Referenced sources

- Australian Bureau of Statistics (2026). *Overseas Arrivals and Departures, Australia.*
- Department of Foreign Affairs and Trade (2025). *Consular State of Play.*
- Smartraveller (2026). *Nepal travel advice.*
- Australian Signals Directorate (2023). *Essential Eight Maturity Model.*
- Porter, M. E. (2008). *The Five Competitive Forces That Shape Strategy.* Harvard Business Review.
- Valacich, J., George, J. & Hoffer, J. (2012). *Essentials of Systems Analysis and Design.*
- *Privacy Act 1988* (Cth), including Australian Privacy Principle 11.
