# FITTA — Interview Question Bank

**Last updated:** 2026-10-28

> **This file deliberately contains no answers.**
> Model answers are written here _after_ you have attempted each question, per `CLAUDE.md`
> §Required learning process. Reading an answer before attempting it converts a retrieval exercise
> into a recognition exercise, and recognition does not survive an interview.
>
> Questions are tagged by phase and revisited later using spaced retrieval.

---

## Phase 00 — Assessment (asked one at a time, in this order)

These four are asked interactively. Do not read ahead if you want the assessment to be worth
anything.

| #        | Question                                                                                                            | Concept under test                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **00.1** | Why should FITTA own its food domain model rather than proxying an external nutrition API?                          | Build-vs-buy; data ownership; coupling to a provider; domain modelling |
| **00.2** | Why must meal logs be separated per user at the data level, rather than filtered per user at the application level? | Ownership modelling; authorization layering; multi-user design         |
| **00.3** | Why did we choose a modular monolith over microservices for a 15-domain application?                                | Architecture trade-offs; transaction boundaries; operational cost      |
| **00.4** | Why should the database model be decided before building complex frontend screens?                                  | Cost of change; dependency direction; schema as a contract             |

### Follow-ups held in reserve

Asked only after a correct answer, to probe depth:

- **00.1a** — A provider offers a free, complete Egyptian food database tomorrow. Does your answer
  change? What would you still own?
- **00.2a** — Your service filters by `userId` in every query. Why is a `user_id` column still
  required, rather than deriving ownership through a join?
- **00.3a** — Name the single piece of evidence that would make you extract a service from FITTA.
  Not a feeling — a measurement.
- **00.4a** — Give an example of a frontend decision that is safe to make _before_ the schema, and
  one that is not.

---

## Concept bank

Each concept uses the 10-point frame from `CLAUDE.md` §Interview preparation:
problem → chosen approach → why → alternatives → trade-offs → when alternatives win → interview
question → follow-up → code/SQL exercise → concise explanation.

Concepts are listed with their anchor question. The frame is filled in during the phase that
introduces them.

### Introduced in Phase 00

| Concept                                                     | Anchor interview question                                                                                                                  | Exercise type                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Transactional vs. reference data** (ADR-009)              | "A user logs a meal. Tomorrow the food's calorie count is corrected. What should their diary show, and how does your schema guarantee it?" | Design the log table; write the test that proves history is immutable                     |
| **Modular monolith boundaries** (ADR-002)                   | "When would you split this into services, and what would break the day you did?"                                                           | Draw the transaction that would become a saga                                             |
| **Session vs. JWT for browsers** (ADR-005)                  | "Why not JWTs? Your interviewer says they're stateless and faster."                                                                        | Describe the revocation flow for both; identify where JWT needs a database anyway         |
| **IDOR and ownership layering** (SECURITY §2.4)             | "Here's a controller that updates a workout set by id. Find the vulnerability."                                                            | Write the failing authorization test first, then the fix                                  |
| **404 vs. 403 on non-owned resources**                      | "Why return 404 for a resource that exists?"                                                                                               | —                                                                                         |
| **Timezone and day bucketing** (ADR-010)                    | "A user in Cairo logs dinner at 1 a.m. Which day is it, and how does your schema know?"                                                    | Write the query for 'show me this day'; explain why it uses an index                      |
| **NULL vs. zero in measurement data** (R6)                  | "What's the difference between a food with 0 g of protein and a food whose protein is unknown? How does your schema express it?"           | Design the table; write the query that distinguishes them                                 |
| **Arabic text normalization and trigram search** (ADR-012)  | "Design search so that five spellings of the same Egyptian dish all match. Why not full-text search?"                                      | Write the normalization function; explain the GIN index; write the `EXPLAIN` you'd expect |
| **Derived vs. materialized aggregates** (ADR-008)           | "Would you store a daily calorie total? Defend either answer."                                                                             | Estimate the row count and the query cost before answering                                |
| **Permission modelling vs. role booleans** (PRD §3.1)       | "Your admin needs to fix a food's portion weight. What else can they now see?"                                                             | Design the permission table                                                               |
| **Provenance and confidence propagation** (DATA_MODEL §4)   | "A recipe is built from five ingredients with different data quality. What's the recipe's confidence?"                                     | Implement the propagation rule                                                            |
| **Estimates vs. measurements in health software** (ADR-013) | "Should logged exercise increase the user's calorie budget?"                                                                               | Derive the net MET formula and explain the double-counting                                |
| **Monorepo contract enforcement** (ADR-006)                 | "How does your repo layout prevent a backend change from silently breaking the frontend?"                                                  | Trace a field rename from schema to UI                                                    |

### Scheduled for later phases

| Phase | Concepts queued                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | pnpm workspaces; TypeScript project references; CI gate design; fail-fast env validation                                                                                   |
| 02    | Argon2id parameters and why; session fixation; CSRF double-submit; timing-safe comparison; rate-limit algorithms (token bucket vs. sliding window); enumeration resistance |
| 03    | Pure functions and testability; partial unique indexes; snapshot-series modelling; safety bounds as domain logic                                                           |
| 04    | GIN vs. GiST; `pg_trgm` internals; index selectivity; `EXPLAIN ANALYZE` reading; seeding strategy; N+1 in catalog reads                                                    |
| 05    | Transaction boundaries; optimistic UI and reconciliation; idempotency keys; composite index column order                                                                   |
| 06    | Time-series modelling; EMA smoothing; EAV trade-offs (why the `type` enum table, and its cost)                                                                             |
| 08    | Deep nested authorization; recomputable derived data; aggregate roots                                                                                                      |
| 10    | Window functions; query performance over date ranges; k-anonymity                                                                                                          |
| 11    | GDPR/PDPL erasure mechanics; cascade vs. anonymize; export streaming                                                                                                       |
| 12    | Load testing; connection pooling; backup/restore drills; zero-downtime migrations                                                                                          |

---

## Spaced retrieval schedule

| Revisit at      | Re-ask concepts from                                     |
| --------------- | -------------------------------------------------------- |
| End of Phase 02 | 00 (all four)                                            |
| End of Phase 04 | 00.2, 02 (sessions, CSRF)                                |
| End of Phase 05 | 00.1, 00.4, ADR-009, ADR-010                             |
| End of Phase 08 | IDOR, ownership layering, 404-vs-403                     |
| End of Phase 10 | ADR-008, derived vs. materialized                        |
| End of Phase 12 | Everything flagged as partially correct on first attempt |

A question answered correctly twice, at least two phases apart, is retired from the active rotation.
