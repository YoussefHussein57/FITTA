# FITTA — Test Strategy

**Status:** Phase 00 draft, awaiting approval
**Last updated:** 2026-10-28

Tests exist to make specific failures impossible, not to produce a coverage number. Every layer
below names the failure it prevents.

---

## 1. The shape of the pyramid, and why it is shaped that way

| Layer                             | Count (rough)   | Speed | What it prevents                                                                                                        |
| --------------------------------- | --------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| **Unit — domain calculations**    | Many            | ms    | A wrong calorie, BMR, MET, or 1RM number. These are pure functions; there is no excuse for them to be wrong             |
| **Unit — services with fakes**    | Many            | ms    | Business-rule violations: two active goals, an unsafe target, a missing snapshot                                        |
| **Integration — real PostgreSQL** | Substantial     | ~s    | Schema, constraint, index, transaction, and cascade failures. Also Arabic search, which cannot be tested against a fake |
| **API / authorization**           | Substantial     | ~s    | **Cross-user data access.** The single most important suite in the product                                              |
| **E2E — Playwright**              | Few, high value | ~min  | Critical journeys end to end, RTL layout, and accessibility                                                             |

The middle is deliberately heavy. FITTA's risk is concentrated in _data correctness_ and
_authorization_, and both are only observable against a real database.

---

## 2. Unit tests

### 2.1 Domain calculations (`modules/energy` and friends)

These are pure functions with no I/O, no clock, and no database (ARCHITECTURE §3.1). That is what
makes them testable against published reference values.

| Function                                 | Tested against                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `calculateBmi(kg, cm)`                   | Hand-computed values; boundary values at category edges; rejects non-positive inputs             |
| `calculateBmr(sex, kg, cm, age)`         | Worked examples from the Mifflin-St Jeor publication                                             |
| `calculateTdee(bmr, activityLevel)`      | Each multiplier, explicitly                                                                      |
| `calculateCalorieTarget(tdee, goal)`     | **Safety floors**: a request implying 900 kcal returns the floor and a reason, never the request |
| `calculateMacros(kcal, weightKg, goal)`  | Macro grams sum to the calorie target within rounding tolerance                                  |
| `estimateActivityKcal(met, kg, minutes)` | Net formula; a 1-MET activity yields ~0 net, not a positive number (ADR-013)                     |
| `estimateOneRepMax(weight, reps)`        | Epley and Brzycki reference values; `reps = 1` returns the weight exactly                        |
| `normalizeArabic(text)`                  | Every row of the ADR-012 table, plus a property test                                             |

**Property tests worth writing:**

- `normalizeArabic` is idempotent: `n(n(x)) === n(x)`. A normalizer that is not idempotent produces
  different results depending on how many times it ran — a bug that is otherwise invisible.
- All documented orthographic variants of a term normalize to the same string.
- `calculateCalorieTarget` never returns below the floor, for any input in the valid domain.
- Unit conversion round-trips within tolerance.

### 2.2 Services with fakes

Prisma is substituted. These test _decisions_, not persistence: "a second active goal is rejected",
"an item without provenance cannot be constructed", "a voice draft cannot be approved after
expiry".

---

## 3. Integration tests — against real PostgreSQL

### 3.1 Why a real database and not a mock

Three categories of bug are invisible to a mocked Prisma client, and all three are high-severity
here:

1. **Constraints.** The partial unique index enforcing one active goal only exists in PostgreSQL. A
   mock will happily accept two.
2. **Arabic search.** `pg_trgm` similarity, `unaccent`, and GIN index behaviour have no faithful
   fake. Testing search against a mock tests nothing.
3. **Transactions and cascades.** "Deleting an entry deletes its items" and "a failed item write
   rolls back the entry" are database behaviours.

### 3.2 Setup

- A dedicated `fitta_test` database on a separate port, via `docker-compose`.
- Migrations applied before the suite — the **same** migrations as production, never
  `db push`. Testing against a schema that production will never have is testing the wrong schema.
- Required extensions (`pg_trgm`, `unaccent`) created by migration, so a missing extension fails
  loudly in CI rather than silently in production.
- Isolation: each test runs in a transaction that is rolled back, with truncation between files.
  Tests must not depend on each other's rows or on ordering.
- A deterministic seed: fixed ids, fixed dates, a known Egyptian food set (koshary, ful, taameya,
  molokhia, baladi bread) with known nutrient values.

### 3.3 What integration tests must cover

| Area                                | Assertions                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arabic search (ADR-012)**         | `كشري`, `كشرى`, `الكشري`, `كُشَرِي`, `koshary`, `kushari`, `koshari` all return koshary in the top 3. A nonsense query returns empty, not everything              |
| **Snapshot immutability (ADR-009)** | Log a meal → mutate the catalog food's nutrients → re-read the log → **values unchanged**. This is the single most important integration test in the product      |
| **Day bucketing (ADR-010)**         | A meal at 01:00 `Africa/Cairo` lands on the Cairo date, not the UTC date. A DST boundary day still totals correctly                                               |
| **Goal invariant**                  | A second `ACTIVE` goal is rejected by the database, not only by the service                                                                                       |
| **Provenance**                      | A `FoodNutrient` row without provenance or source cannot be inserted                                                                                              |
| **Unknown vs zero**                 | A food with no protein row renders as unknown; a food with protein `0` renders as zero. They are distinguishable end to end                                       |
| **Cascade**                         | Deleting a user removes all user-owned rows and **no** catalog rows                                                                                               |
| **Index usage**                     | `EXPLAIN ANALYZE` on the diary query uses the `(user_id, local_date)` index — asserted, because an index that stops being used is a silent performance regression |
| **Recipe yield**                    | A cooked recipe without `total_cooked_weight_g` is rejected (DATA_MODEL §5)                                                                                       |

---

## 4. Authorization tests — the mandatory suite

**This suite is non-negotiable and gates every phase.** Its premise: write the attack, then prove it
fails.

### 4.1 The fixture

Every authorization test uses two fully-populated users — User A and User B — each with meals,
measurements, workouts, and recipes, plus an administrator holding `catalog:write` only.

### 4.2 The matrix

For **every** user-owned resource, all of the following must be asserted:

| #   | Attack                                                 | Expected                                   |
| --- | ------------------------------------------------------ | ------------------------------------------ |
| 1   | B reads A's resource by id                             | **404** (not 403 — 403 confirms existence) |
| 2   | B updates A's resource                                 | 404                                        |
| 3   | B deletes A's resource                                 | 404                                        |
| 4   | B lists resources — A's never appear                   | A's ids absent                             |
| 5   | B creates a resource with `userId: A` in the body      | Field rejected/ignored; row belongs to B   |
| 6   | B adds a child to A's parent (item→entry, set→session) | 404                                        |
| 7   | Unauthenticated request                                | 401                                        |
| 8   | Expired session cookie                                 | 401                                        |
| 9   | Revoked (logged-out) session cookie                    | 401                                        |
| 10  | Catalog admin reads A's C3 data                        | 403                                        |
| 11  | Cross-site request without a CSRF token                | Rejected                                   |
| 12  | Sequential-id enumeration                              | Ids are non-sequential; no data returned   |

### 4.3 Automation over enumeration

The matrix is parameterized over a registry of owned resources, so **adding a resource to the
registry automatically generates its twelve attacks**. A new endpoint that forgets to register is
caught by an architectural test that compares the route table against the registry.

This matters more than it sounds: the realistic failure mode is not writing a bad guard, it is
adding endpoint #47 and forgetting the test. Generating the tests from the route table removes
human memory from the loop.

### 4.4 Architectural assertions

- No request DTO in the codebase declares a `userId` field.
- Every route under `/me/*` carries `SessionGuard`.
- Every admin route carries `PermissionGuard` with an explicit permission.
- Every `$queryRaw` call site uses a tagged template (no string concatenation).
- The log redactor emits no forbidden key when fed an object containing all of them.

---

## 5. End-to-end tests (Playwright)

Few, expensive, and reserved for journeys where a break is catastrophic.

| Flow                                                 | Assertions                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Register → onboard → set goal → see target           | Target is labeled estimated; an unsafe rate is clamped with an explanation              |
| Search Arabic → pick portion → log → see daily total | The total matches the sum; provenance is visible on screen                              |
| Log weight → see trend                               | The chart renders; the smoothing label is present                                       |
| Log a workout with sets → see it in history          | Values persist and reload correctly                                                     |
| Log out → attempt to reach the dashboard             | Redirected to login                                                                     |
| **RTL layout**                                       | Arabic locale sets `dir="rtl"`; no horizontal overflow at 360 px; **chart axes mirror** |
| **Accessibility**                                    | `axe` passes with no critical violations on dashboard, diary, and food search           |
| Keyboard-only logging                                | The entire log-a-meal flow is completable without a mouse                               |

RTL gets its own entry because it is the defect class most likely to ship unnoticed — everything
works, it just looks wrong to half the users, and the developer testing in English never sees it.

---

## 6. Provider mocks

Every external provider sits behind an interface with **two** implementations: the real adapter and
a deterministic mock (`CLAUDE.md` §External API rules).

| Provider                     | Mock behaviour                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FoodDataProvider` (USDA)    | Fixed fixtures; simulates timeout, 429, and malformed-payload paths                                                                              |
| `EmailProvider`              | Captures messages in memory; tests assert a reset email was "sent" and extract the token                                                         |
| `TranscriptionProvider` (V2) | Returns canned Egyptian-Arabic transcripts, including deliberately _wrong_ ones so the draft-approval path is exercised against a misrecognition |

**No test ever makes a real network call.** A test suite that depends on a third party is a suite
that fails for reasons unrelated to your code, and is therefore a suite people learn to ignore.

---

## 7. What is deliberately not tested

| Not tested                          | Why                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| Prisma's own query generation       | It is a dependency, not our code                             |
| shadcn/ui primitive internals       | Same                                                         |
| Getter/setter and pass-through code | Tests that only restate the implementation                   |
| Exact pixel rendering               | Brittle; visual regression is a separate tool if ever needed |
| Third-party API availability        | Mocked by policy                                             |

Coverage is a diagnostic, not a target. An untested `calculateCalorieTarget` is a defect; an
untested DTO class is fine.

---

## 8. CI pipeline

```
pnpm install --frozen-lockfile
  ↓
lint            (eslint, both apps)
typecheck       (tsc --noEmit, all packages)       ← catches cross-app contract breaks
  ↓
unit            (vitest/jest — fast, no DB)
  ↓
[spin up postgres service + apply migrations]
integration     (real DB)
authorization   (the §4 matrix — a failure here blocks merge, always)
  ↓
build           (next build, nest build)
  ↓
e2e             (playwright, against the built app)
```

Rules:

- A failing authorization test is never skipped, quarantined, or marked flaky. It blocks.
- Migrations are verified by applying them to an empty database from scratch on every run — a
  migration that only works against _your_ database is not a migration.
- No test writes to a developer's real database.

---

## 9. Per-phase test gate

A phase is not complete until:

- [ ] New domain calculations have unit tests with cited reference values.
- [ ] New invariants have integration tests that assert the **database** enforces them.
- [ ] Every new user-owned resource is in the authorization registry, generating its 12 attacks.
- [ ] Any new critical journey has an E2E test.
- [ ] Any new provider has a mock adapter.
- [ ] Lint, typecheck, build, and all suites pass — with the actual output reported, not asserted.
