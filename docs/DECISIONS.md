# FITTA — Architecture Decision Records

**Status:** Phase 00 draft, awaiting approval
**Last updated:** 2026-10-28

Each ADR states the problem, the decision, the reasoning, the alternatives with their real
trade-offs, and — most importantly — **the condition under which the alternative becomes the better
choice**. An ADR without that last section is just an opinion.

| ADR             | Decision                                                           | Status   |
| --------------- | ------------------------------------------------------------------ | -------- |
| [001](#adr-001) | NestJS over Express                                                | Accepted |
| [002](#adr-002) | Modular monolith over microservices                                | Accepted |
| [003](#adr-003) | REST + OpenAPI over GraphQL                                        | Accepted |
| [004](#adr-004) | Prisma, with raw SQL as a sanctioned escape hatch                  | Accepted |
| [005](#adr-005) | Server-side sessions over browser-held JWTs                        | Accepted |
| [006](#adr-006) | Single pnpm monorepo over split repositories                       | Accepted |
| [007](#adr-007) | Hybrid rendering: RSC for reads, client fetching for interaction   | Accepted |
| [008](#adr-008) | Daily summaries calculated on read, not materialized               | Accepted |
| [009](#adr-009) | Nutrition snapshotted onto meal log items at write time            | Accepted |
| [010](#adr-010) | Explicit local date + timezone for day-bucketed data               | Accepted |
| [011](#adr-011) | Metric canonical units everywhere internally                       | Accepted |
| [012](#adr-012) | Arabic search via normalized column + pg_trgm, not FTS stemming    | Accepted |
| [013](#adr-013) | Estimated activity calories never auto-increase the calorie budget | Accepted |

---

<a id="adr-001"></a>

## ADR-001 — NestJS over Express

**Problem.** The backend needs a structure that survives fifteen domains and a solo developer who is
primarily a frontend engineer. The failure mode to avoid is the one every Express app reaches around
file forty: route handlers that each do validation, authorization, business logic, and data access
inline, with no enforced seam between them.

**Decision.** NestJS.

**Why.** Three things, in order of how much they matter here:

1. **Dependency injection makes the service layer testable without the HTTP layer.** `MealLogService`
   takes `PrismaService` in its constructor. A unit test substitutes a fake. With bare Express the
   usual shape is a handler that imports the client directly, and the only way to test it is to boot
   a server.
2. **Guards are a declarative authorization seam.** `@UseGuards(SessionGuard, PermissionGuard)` on a
   controller is reviewable at a glance and greppable across the codebase. In Express, authorization
   is middleware ordering — and a route registered above the auth middleware is silently public.
   Given that `ARCHITECTURE.md` §7.3 names authorization bypass as the top risk, a structural
   defence beats a convention.
3. **`ValidationPipe` + `class-validator` makes DTO validation the default rather than a thing you
   remember.** With `whitelist: true, forbidNonWhitelisted: true`, an unexpected field in a request
   body is rejected rather than ignored — which is itself a mass-assignment defence.

Secondary: `@nestjs/swagger` generates the OpenAPI document from the DTOs that already exist, so the
API documentation cannot drift from the code (ADR-003 depends on this).

**Alternatives.**

| Option                              | Trade-off                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Express + hand-rolled structure** | Lower ceremony, no decorators, smaller dependency surface, faster cold start. But every structural guarantee becomes a convention you must personally enforce, forever, with no compiler help. For a solo developer _learning_ backend architecture, that is precisely backwards: you want the framework to teach the shape. |
| **Fastify (bare)**                  | ~2–3× Express throughput and a good schema-validation story. FITTA's bottleneck will be PostgreSQL and Arabic text search, not HTTP parsing. Buying throughput we cannot use at the cost of structure we need is a bad trade. (Note: Nest can _run on_ Fastify, so this is recoverable later.)                               |
| **tRPC**                            | Excellent end-to-end types with zero codegen. Rejected because it is RPC over HTTP, not REST: no meaningful OpenAPI document, awkward for the public catalog endpoints, and it assumes a TypeScript client — which forecloses the future mobile/native client that wearables (V3) will need.                                 |
| **Hono / Elysia**                   | Modern, fast, small. Too young for the "boring and documented" requirement, and the DI/guard story is not there.                                                                                                                                                                                                             |

**When the alternative wins.** Choose Express or Fastify directly if the service is genuinely small
(under ~15 endpoints), is a single-purpose edge service, or has a hard cold-start requirement such
as serverless-per-request. Choose tRPC if the API is private to one TypeScript frontend forever and
you will never publish a contract. FITTA is none of these.

**Cost accepted.** Decorator-heavy code, a steeper initial learning curve, and a framework opinion to
learn. That learning curve is partly the point — see `CLAUDE.md` §Your role.

---

<a id="adr-002"></a>

## ADR-002 — Modular monolith over microservices

**Problem.** Fifteen domains is enough to make someone reach for service decomposition.

**Decision.** One deployable NestJS application with hard module boundaries and the dependency rules
in `ARCHITECTURE.md` §2.2.

**Why.** The decisive argument is transactional: logging a meal writes a `meal_log_entry`, its
`meal_log_item` rows with nutrient snapshots, and (in V2) resolves a `voice_draft`. In a monolith
that is one PostgreSQL transaction and it either happens or it doesn't. Split across services it
becomes a saga with compensating actions, and the failure mode is a user's diary containing a meal
with no items.

Secondary: microservices convert compile-time type errors into runtime network errors — exactly the
guarantee that `packages/contracts` exists to provide. And the operational cost (service discovery,
distributed tracing, per-service CI/CD, versioned inter-service contracts) is paid by a team FITTA
does not have.

**Alternatives.**

| Option                                           | Trade-off                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microservices per bounded context**            | Independent scaling and deployment, team autonomy, fault isolation. Costs: distributed transactions, network partitions as a routine case, N× operational overhead, debugging across process boundaries. Every one of those costs is paid immediately; every benefit arrives only at a scale FITTA is years from. |
| **Serverless functions per endpoint**            | Scale-to-zero economics. But Prisma + connection pooling against PostgreSQL is a known pain point, cold starts hurt the ≤300 ms search target (NFR-01), and there is no natural home for a shared domain layer.                                                                                                   |
| **Extract only the voice/transcription service** | Genuinely tempting at V2 — it is CPU-bound, has a different scaling profile, and calls a slow external API. Deferred, and noted as the _first_ candidate if extraction is ever warranted.                                                                                                                         |

**When the alternative wins.** Extract a service when at least one is true: (a) one domain's
resource profile diverges sharply — long-running CPU or memory work such as audio processing;
(b) separate teams need independent release cadence; (c) one domain needs a different scaling
curve or a different runtime; (d) a regulatory boundary demands process isolation. Until then, a
module boundary gives most of the design benefit at none of the operational cost — and a
well-bounded module is _extractable_, which is the whole point of enforcing the boundaries now.

---

<a id="adr-003"></a>

## ADR-003 — REST + OpenAPI over GraphQL

**Problem.** The frontend needs an API with predictable shapes, and the project needs documentation
that cannot drift.

**Decision.** REST, documented with OpenAPI generated from the NestJS DTOs, with request and response
schemas defined in `packages/contracts`.

**Why.** FITTA's access patterns are overwhelmingly fixed and known in advance: a diary day, a food
search, a workout session, a weight series. That is REST's best case. GraphQL's core benefit —
clients composing arbitrary queries the server did not anticipate — is a benefit FITTA has no use
for, because there is exactly one first-party client and its queries are known at build time.

The cost side is decisive for a security-sensitive app. GraphQL turns authorization into a
**per-field** problem across an arbitrary traversal graph, and introduces query-depth and
query-complexity attacks as a standard concern. `ARCHITECTURE.md` §7.3 already names authorization
as the top risk; REST lets authorization live on a finite, enumerable set of endpoints that can each
be tested exhaustively. The authorization matrix in `SECURITY.md` is writable _because_ the surface
is finite.

Also: HTTP caching, CDN behaviour, rate limiting per route, and `curl`-ability all come free with
REST and all require bespoke work in GraphQL.

**Alternatives.**

| Option                   | Trade-off                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GraphQL**              | Solves over-fetching and under-fetching; one round trip for a composed screen; a strong single schema. Costs: per-field authz, N+1 by default (needs DataLoader everywhere), complexity-limiting middleware, caching you build yourself, and a much larger attack surface. |
| **tRPC**                 | See ADR-001 — no language-neutral contract.                                                                                                                                                                                                                                |
| **REST without OpenAPI** | Less tooling, but then documentation is hand-written and therefore wrong within two sprints.                                                                                                                                                                               |

**When the alternative wins.** GraphQL earns its cost when there are many heterogeneous clients you
do not control, when screens are user-composable, when mobile round-trip count is a measured
bottleneck, or when a BFF would otherwise be needed per client. Revisit if FITTA ships native
clients plus a trainer dashboard plus a public API and the shapes genuinely diverge.

---

<a id="adr-004"></a>

## ADR-004 — Prisma, with raw SQL as a sanctioned escape hatch

**Problem.** Data access needs type safety, reviewable migrations, and the ability to express the
Arabic search query — which is not expressible in any ORM's query DSL.

**Decision.** Prisma as the default. `$queryRaw` with tagged-template parameterization is explicitly
sanctioned for search and analytical queries, isolated in dedicated repository classes.

**Why.** Prisma's generated types mean a schema change surfaces as a compile error at every call
site — the single highest-value property for a developer learning the domain. Prisma Migrate gives
versioned, reviewable, forward-only SQL. And `prisma.mealLogItem.findMany({ where: { entry: { userId } } })`
makes the ownership scope visible in the call, which matters given §7.3.

The escape hatch is not a concession, it is a requirement. Arabic search needs `pg_trgm` similarity
ranking, `unaccent`, a custom normalization function, and a composite ranking expression. No ORM
expresses that. Pretending otherwise would mean a worse search — the one thing the product cannot
compromise on.

**Alternatives.**

| Option                      | Trade-off                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drizzle**                 | Closer to SQL, lighter runtime, excellent types, no separate engine binary. Weaker migration ergonomics and a smaller ecosystem. A genuinely defensible alternative; Prisma wins on migration tooling and on teaching value — its schema file is a readable domain model. |
| **Kysely**                  | Best-in-class typed query builder, essentially typed SQL. No migration story and no schema as a source of truth; would need to be paired with something else.                                                                                                             |
| **TypeORM**                 | Mature, Nest-idiomatic, Active Record or Data Mapper. Rejected: a long history of migration-generation bugs and surprising lazy-loading behaviour.                                                                                                                        |
| **Raw SQL + a thin mapper** | Maximum control and the best teaching tool for SQL itself. Costs hand-written types that drift from reality — the exact class of bug that causes wrong nutrition numbers.                                                                                                 |

**When the alternative wins.** Go raw-SQL-first when the workload is analytics-dominated, when
queries need query-planner-level tuning as a routine matter, or when the team's SQL is strong and
ORM indirection is the bottleneck. Choose Drizzle when bundle size or edge-runtime compatibility
matters. **Guardrail:** every `$queryRaw` must use tagged-template parameters — never string
concatenation — and must live in a repository class with an integration test. String-interpolated
SQL is a blocking review failure.

---

<a id="adr-005"></a>

## ADR-005 — Server-side sessions over browser-held JWTs

**Problem.** A web-first application handling special-category health data needs browser
authentication that can be revoked instantly.

**Decision.** Opaque session identifiers in an `HttpOnly; Secure; SameSite=Lax` cookie, with session
state in PostgreSQL. The token is stored **hashed** at rest. CSRF protection via the double-submit
pattern on state-changing requests.

**Why.** **Revocation is the whole argument.** "Log out of all devices", "password reset invalidates
every session" (US-04 AC3), and "a compromised session is cut off now" are product requirements.
A stateless JWT cannot be revoked — it is valid until it expires, by construction. The standard
workaround is a server-side denylist, at which point you have the database lookup you adopted JWTs
to avoid, plus the complexity of refresh-token rotation, plus two classes of token to get wrong.

Second: a JWT must be stored somewhere in the browser. `localStorage` is readable by any XSS, and
this payload is health data. An `HttpOnly` cookie is not readable by JavaScript at all — it removes
token theft from the XSS blast radius entirely.

Third: the lookup "costs" one indexed primary-key read on a database we are already querying. At
FITTA's scale that is sub-millisecond, and it buys per-request freshness: revoked _now_ means
revoked _now_.

**Alternatives.**

| Option                                                        | Trade-off                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JWT access + refresh rotation**                             | Stateless verification, scales horizontally with no shared session store, natural for multi-service. Costs: no true revocation, refresh-rotation complexity, replay-detection requirements, and a storage decision with no good answer in a browser.                                              |
| **JWT in an HttpOnly cookie**                                 | Fixes the storage problem, keeps the revocation problem, and still needs CSRF protection. Strictly worse than an opaque session for this use case — you pay JWT's complexity and get none of its statelessness benefit.                                                                           |
| **A managed identity provider (Auth0, Clerk, Supabase Auth)** | Fastest to ship, solves MFA/social/recovery. Rejected for V1 on two grounds: it outsources the single most instructive part of the system (see `CLAUDE.md` §Your role), and it places health-adjacent identity data with a third party before the privacy policy is written. Reconsider at scale. |

**When the alternative wins.** JWTs win with many independent services verifying tokens without a
shared store, with third-party API consumers, with a mobile client where cookies are awkward, or
when horizontal scale makes a session store a genuine bottleneck. If FITTA later adds a native
client, the clean answer is a _separate_ token-based flow for that client, not converting the web
app away from sessions.

---

<a id="adr-006"></a>

## ADR-006 — Single pnpm monorepo over split repositories

**Problem.** Should `apps/web` and `apps/api` live in one repository or two?

**Decision.** One repository: `YoussefHussein57/FITTA`, pnpm workspaces.

**Why.** The binding constraint is the API contract. A meal log item carries a nutrient snapshot, a
provenance tag, and a portion reference, and the web app must render all three correctly or it
displays wrong health data. In one repository, `packages/contracts` holds the Zod schemas and a
breaking backend change **fails `pnpm typecheck` in the same commit**. Split in two, that change
merges green on the API side and the breakage is discovered in production as a wrong number on a
screen.

Splitting also forces `packages/contracts` to be versioned and published to a registry, with the
attendant version-skew problem — real operational work that buys nothing while one person writes
both sides. And atomic cross-stack changes (add a field → migration → DTO → contract → UI) become a
coordinated multi-repo dance with no single reviewable diff.

**Alternatives.**

| Option                                   | Trade-off                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Separate `fitta-api` and `fitta-web`** | Independent CI, smaller clones, clean per-repo access control, independent release cadence. Costs: a published shared contract package, version skew, no atomic cross-stack commit, duplicated tooling config. |
| **Monorepo with Nx or Turborepo**        | Task caching and affected-graph builds — valuable at scale. Deferred: pnpm workspaces plus plain scripts is enough until CI times hurt. Adding Turborepo later is a config change, not a migration.            |
| **Single Next.js app with API routes**   | Simplest possible deployment, one process. Rejected: it dissolves the backend boundary this project exists to teach, has no DI/guard/OpenAPI story, and makes the backend un-extractable.                      |

**When the alternative wins.** Split when separate teams own the two sides with different release
cadences, when CI exceeds roughly 10–15 minutes and affected-graph tooling is not enough, when an
external contractor needs access to one side only, or when the repository becomes large enough that
clone and tooling times are a daily tax. Splitting later is a mechanical `git filter-repo` plus
publishing one package — meaningfully cheaper than maintaining two repos today.

---

<a id="adr-007"></a>

## ADR-007 — Hybrid rendering: RSC for reads, client fetching for interaction

**Problem.** Next.js App Router permits both; choosing one everywhere is wrong in both directions.

**Decision.** Per-surface, per the table in `ARCHITECTURE.md` §4.1. React Server Components for
public catalog pages and authenticated first paint; Client Components with TanStack Query for food
search, meal logging, and set logging.

**Why.** The two surfaces have genuinely different requirements.

Catalog pages are public, read-heavy, and SEO-relevant — "سعرات الكشري" is a search term people
type, and that traffic is an acquisition channel. RSC renders them on the server, cached, with no
client-side data fetching and no JavaScript cost.

Food search is the opposite: debounced input, in-flight request cancellation, cached result pages,
and optimistic writes when logging. Implementing that on top of server actions and router
refreshes means rebuilding TanStack Query badly. Meanwhile the dashboard and diary day view want
RSC for first paint — the user's real data in the first HTML byte — and then hand off to client
components for interaction.

**Alternatives.**

| Option                                                      | Trade-off                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All client-side (SPA + TanStack Query everywhere)**       | One mental model, simplest data flow, trivially portable to a future native client. Costs: no SEO on catalog pages, a loading spinner on every first paint, a larger JS bundle on mobile — where NFR-09 says the user is. |
| **All server (RSC + server actions, no client data layer)** | Minimal JS, excellent first paint. Costs: a full server round trip per interaction, no optimistic UI, no request cancellation. Search would feel broken.                                                                  |
| **Separate Next.js BFF layer**                              | Hides the API, enables response shaping. Rejected: a third place for logic to hide, directly against `CLAUDE.md`'s "no business logic in controllers" in spirit.                                                          |

**When the alternative wins.** Go all-client when the app is entirely behind a login with no SEO
surface, or when a native client is imminent and you want one shared data layer. Go all-server when
interactions are genuinely page-level (forms that submit and navigate) and bundle size dominates.
**Guardrail:** the session cookie is forwarded on server-side fetches, and _no_ fetch to an external
provider ever originates in the browser.

---

<a id="adr-008"></a>

## ADR-008 — Daily nutrition summaries calculated on read, not materialized

**Problem.** The dashboard shows calories and macros consumed per day. Compute on demand, or store a
summary row?

**Decision.** Calculate on read in V1, from `meal_log_item`, via an index leading with
`(user_id, local_date)`.

**Why.** Run the arithmetic before adding a table. A heavy user logs perhaps 10 items a day. Summing
10 rows from a covering index is well under a millisecond — orders of magnitude inside the 50 ms
budget in NFR-03. A year of history for the trend view is ~3,650 rows, aggregated in a single
indexed scan.

The cost of materializing is not the table — it is the **cache invalidation**, and this cache has an
unusual number of invalidation triggers: creating, editing, or deleting a log item; editing a
recipe that a logged item derived from; a timezone change moving an entry across a day boundary; a
backfilled historical entry. Each is a chance for the displayed total to disagree with the diary
beneath it, which destroys user trust in a product whose entire premise is trustworthy numbers.

And materializing is a strictly additive change later: add the table, backfill, read through it. We
lose nothing by waiting, and we gain real measurements to size it with.

**Alternatives.**

| Option                                                           | Trade-off                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Materialized `daily_nutrition_summary` row, updated on write** | O(1) dashboard read regardless of item count; cheap multi-month analytics. Costs: invalidation on every mutation path, write amplification, and drift risk.                          |
| **PostgreSQL materialized view, refreshed periodically**         | No application-level invalidation code. But the refresh is global, not per-user, and stale-by-design is wrong for _today's_ total — the number the user is actively watching change. |
| **Incremental counter columns**                                  | Fastest reads. Worst correctness: a missed decrement is permanent and silent.                                                                                                        |

**When the alternative wins.** Materialize when at least one holds: a measured p95 above the NFR-03
budget; analytics spanning ≥90 days becoming the dominant read pattern; or an aggregate view across
many users (trainer dashboards, V2). **Invariant that survives either choice:** the summary is
always reproducible from the logs. A reconciliation test asserts materialized values equal
recomputed values, so adopting materialization never makes the logs stop being the source of truth.

---

<a id="adr-009"></a>

## ADR-009 — Nutrition snapshotted onto meal log items at write time

**Problem.** When a user logs 300 g of koshary, do we store a reference to the catalog food, or a
copy of its nutrition?

**Decision.** Store both. `food_id` for provenance and UX ("log again"), **and** an immutable
snapshot of the nutrient values, the gram weight, the portion label, and the provenance tag as they
were at the moment of logging.

**Why.** The catalog is mutable by design — correcting data is a core administrative function. A
user's history is not. If the diary joins to the live catalog, then correcting koshary from 420 to
380 kcal rewrites every historical day silently. A user who met their target last March now didn't.
Their intake history stops reconciling with their weight history, and the product's central claim —
that its numbers are trustworthy — fails in the one place trust is built.

This is the standard **transactional-vs-reference data** distinction: an invoice stores the price at
purchase, not a foreign key to a mutable price list. A meal log is an invoice.

It also makes `PRD.md` P2 and P3 enforceable: the snapshot carries the provenance tag that was true
when logged, so a value later promoted from `COMMUNITY_ESTIMATED` to `MANUFACTURER_CONFIRMED` does
not retroactively claim the old entry was confirmed.

**Alternatives.**

| Option                                               | Trade-off                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reference only (`food_id` + join at read)**        | Smaller rows, one source of truth, corrections propagate automatically. That automatic propagation is exactly the bug.                                                                                                                                                                                           |
| **Versioned catalog (`food_version_id` on the log)** | Full history with no duplication, and corrections are auditable. Genuinely elegant — and significantly more machinery: every catalog edit creates a version, every read resolves one, and the version table grows without bound. Deferred as the natural upgrade if catalog audit history becomes a requirement. |
| **Snapshot only, no `food_id`**                      | Maximum immutability. Loses "log this again", breaks the link to a food's current page, and makes analytics across foods impossible.                                                                                                                                                                             |

**When the alternative wins.** Versioning beats snapshotting when the catalog needs a full audit
trail of its own (a regulatory requirement, or disputes about what a value was on a date), or when
snapshot storage becomes material — it will not at FITTA's scale; a snapshot is a few hundred bytes
against ~22M rows (NFR-04), which is gigabytes, not terabytes.

**Consequence to enforce:** editing a catalog food **must not** touch any `meal_log_item`. There is a
test for this (US-11 AC3).

---

<a id="adr-010"></a>

## ADR-010 — Explicit local date + timezone for day-bucketed data

**Problem.** "Which day does this meal belong to?" has no correct answer derivable from a UTC
instant alone.

**Decision.** Day-bucketed rows (`meal_log_entry`, `workout_session`, `activity_log`,
`body_measurement`) store three things: `logged_at timestamptz` (the instant), `local_date date`
(the user's calendar day, computed at write time), and `timezone text` (the IANA zone used).

**Why.** A Cairo user logging dinner at 01:00 EET is at 23:00 UTC the previous day. Deriving the
diary date from the UTC instant puts that meal on yesterday — so yesterday shows two dinners and
today shows no breakfast. The user concludes the app is broken, and they are right.

Deriving at _read_ time instead needs the user's timezone at read time, which (a) may have changed
since (travel, relocation), and (b) silently re-buckets historical data when it does. Someone who
logged a month of meals in Cairo and then moves to Toronto would see their history shift by seven
hours. Storing the local date freezes the answer at the moment it was unambiguous — when the user
was standing there logging it.

Keeping the `timezone` alongside preserves the ability to audit and recompute, and makes DST
transitions (where a local day is 23 or 25 hours long) explainable rather than mysterious.

It also makes the index trivially efficient: `(user_id, local_date)` answers "show me this day" with
an equality match, no function call, no timezone conversion in the predicate, no index invalidation.

**Alternatives.**

| Option                                                       | Trade-off                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UTC instant only, derive at read**                         | Smallest schema. Wrong for anyone not at UTC+0 and silently re-buckets history on timezone change.                                                   |
| **Store local wall-clock time without a zone (`timestamp`)** | Matches what the user saw. Loses the real instant — ordering across zones becomes impossible and DST becomes ambiguous.                              |
| **Let the user pick the diary date manually**                | Explicit and honest. Terrible ergonomics for the most frequent action in the product. (We still allow _overriding_ the date for backfilled entries.) |

**When the alternative wins.** UTC-only is fine for data that is genuinely instant-based and never
bucketed by calendar day — audit logs, auth events, created-at timestamps. Those use plain
`timestamptz` and should not carry a local date. The rule is: **bucketed by day → store the day.**

---

<a id="adr-011"></a>

## ADR-011 — Metric canonical units everywhere internally

**Problem.** Users enter weight in kg or lb, height in cm or ft/in, food in g or oz.

**Decision.** Internally: kilograms, centimetres, grams, millilitres, kilocalories, seconds, always.
Conversion happens at the presentation boundary only. The unit the user _entered_ is stored as
metadata (`entered_unit`) for display fidelity, never as the basis for calculation.

**Why.** Mixed-unit storage means every calculation must first ask "what unit is this?", and the
answer lives in a different column, which means a forgotten check is a silent 2.2× error in a
health number. Egypt is metric, every nutrition reference (USDA, food composition tables) is metric,
and every formula in the domain (Mifflin-St Jeor, MET, BMI) takes metric inputs. Converting at the
edge means the domain layer has no unit logic at all — `calculateBmr` takes `kg` and `cm` because
there is no other possibility.

Storing `entered_unit` separately preserves the nicety that a user who typed "180 lb" sees "180 lb"
rather than "81.65 kg" rounded back, without ever letting that unit reach a calculation.

**Alternatives.**

| Option                                         | Trade-off                                                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Store the user's unit, convert on read**     | Perfect display fidelity. Every aggregate query must convert, comparisons across users break, and indexes on the value column become meaningless.                                                                                 |
| **A unit-typed value object (`Quantity<Kg>`)** | Compile-time unit safety — genuinely attractive. Rejected for V1: it does not survive the Prisma/JSON/HTTP boundary without significant machinery, and canonical-unit storage achieves most of the benefit with none of the cost. |

**When the alternative wins.** A typed-unit library earns its cost in scientific or engineering
domains with many interacting unit systems. FITTA has one unit system and a display preference.

---

<a id="adr-012"></a>

## ADR-012 — Arabic search via a normalized column + pg_trgm, not FTS stemming

**Problem.** `كشري`, `كشرى`, `الكشري`, `koshary`, `kushari`, and `koshari` must all find the same
food. This is the product's core value proposition (`PRD.md` §1), not a nice-to-have.

**Decision.** Each name row stores a `normalized` column alongside the original. Normalization is a
deterministic pipeline applied identically at write and at query time. Matching uses `pg_trgm`
similarity with a GIN index, ranked by name type and popularity. Each food has multiple
`food_name` rows typed as `OFFICIAL | COLLOQUIAL | TRANSLITERATION | SYNONYM | BRAND`.

The normalization pipeline:

| Step                                                | Example               |
| --------------------------------------------------- | --------------------- |
| Strip tatweel (U+0640)                              | `كـشـري` → `كشري`     |
| Strip harakat / diacritics (U+064B–U+0652, U+0670)  | `كُشَرِي` → `كشري`    |
| Unify alef forms (أ إ آ ٱ → ا)                      | `أرز` → `ارز`         |
| Unify alef maqsura (ى → ي)                          | `كشرى` → `كشري`       |
| Unify ta marbuta (ة → ه)                            | `طعمية` → `طعميه`     |
| Unify hamza forms (ؤ ئ → و ي)                       | —                     |
| Strip the definite article `ال` prefix for matching | `الكشري` → `كشري`     |
| Lowercase, strip Latin accents (`unaccent`)         | `Koshári` → `koshari` |
| Collapse whitespace and punctuation                 | —                     |

**Why not PostgreSQL full-text search as the primary mechanism.** Stock PostgreSQL ships **no Arabic
text-search configuration** — no Arabic stemmer, no Arabic stop-word list. Using
`to_tsvector('arabic', ...)` is not available, and `to_tsvector('simple', ...)` performs no stemming
at all, so it degrades to exact token matching. Arabic morphology (prefixed definite articles,
attached pronouns, broken plurals) means exact token matching fails constantly. Pretending FTS
solves this would produce a search that looks principled and does not work.

Trigram similarity, applied to a _normalized_ string, handles the actual failure modes: spelling
variation, transliteration variance, partial input, and typos — all at once, with one index. It also
handles Franco-Arabic naturally, because `koshary` and `kushari` share most of their trigrams.

**Alternatives.**

| Option                                                                | Trade-off                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`tsvector` with the `simple` config + a manual synonym dictionary** | Better for long-text relevance ranking; can be combined with trigram. Needs a hand-maintained Arabic synonym and stop-word dictionary. Worth adding _alongside_ trigram if ranking quality proves insufficient.                                                                |
| **Elasticsearch / OpenSearch with an Arabic analyzer**                | A real Arabic analyser with stemming and normalization built in; the best quality ceiling. Costs: a second datastore, index synchronization, an operational burden, and a new consistency problem — for a catalog measured in thousands of rows. Grossly disproportionate now. |
| **`LIKE '%query%'`**                                                  | Trivial. No index use (leading wildcard), no ranking, no variant handling. Fails the product requirement and NFR-01 simultaneously.                                                                                                                                            |
| **Normalize in application code only, query exactly**                 | Simple and portable. Catches variants but not typos or partial input, and ranking must be hand-built.                                                                                                                                                                          |

**When the alternative wins.** Move to Elasticsearch when the catalog passes roughly 10⁵ entries,
when relevance tuning becomes a continuous product activity, or when multi-field weighted ranking
across brands, restaurants, and products becomes the dominant search mode. Add `tsvector` alongside
trigram when searching descriptions or ingredient lists, not just names.

**Non-negotiable consequence:** normalization is **one** function, applied at write and at query.
Two implementations that drift is a silent, unfalsifiable search-quality bug. It gets a property
test.

### ADR-012a — The database must be created with a UTF-8 ctype, not `C`

Discovered and verified empirically in Phase 01, Slice 2.

`pg_trgm` classifies characters using the database's `ctype`. Under `--locale=C`, non-ASCII
characters are not alphanumeric, so **every Arabic character is discarded before trigrams are
extracted** and two Arabic strings are compared as two empty sets.

Measured on PostgreSQL 17.6, `pg_trgm` 1.6, same data, only the locale differing:

| Pair                         | `--locale=C` | `--locale=C.UTF-8` |
| ---------------------------- | ------------ | ------------------ |
| `كشري` vs `كشرى`             | **0**        | 0.43               |
| `كشري` vs `الكشري`           | **0**        | 0.33               |
| `طعمية` vs `طعميه`           | **0**        | 0.50               |
| `koshary` vs `kushari`       | 0.23         | 0.23               |
| `كشري` vs `ملوخية` (control) | 0            | 0                  |

Note what makes this dangerous: the Latin pair scores identically under both locales, and no query
errors. A developer testing transliterated search sees a working feature. Arabic search returns
nothing, forever, with no error anywhere — the exact failure mode RISK-03 describes, caused by an
infrastructure default rather than by search code.

**Binding requirements:**

1. Every FITTA database — development, test, CI, production — is created with a UTF-8 ctype.
2. The Phase 04 test suite asserts a non-zero similarity between known Arabic variants, so this
   regresses loudly rather than silently if an environment is ever provisioned differently.

**Related finding — `unaccent` does not touch Arabic.** `unaccent('كُشَرِي')` returns the string
unchanged, while `unaccent('Koshári')` correctly yields `Koshari`. The extension's dictionary is
Latin-oriented. It therefore serves the transliteration half of ADR-012 only; stripping harakat,
tatweel, and unifying alef/ya/ta-marbuta forms is entirely our own normalizer's job. This does not
change the decision — the pipeline was always ours — but it removes any temptation to lean on
`unaccent` for the Arabic side.

---

<a id="adr-013"></a>

## ADR-013 — Estimated activity calories never auto-increase the calorie budget

**Problem.** The user walks for 40 minutes. FITTA estimates 180 kcal. Does today's target become
higher by 180?

**Decision.** No. Estimated expenditure is displayed as a clearly labeled estimate with its MET
source cited, and the calorie target is unchanged by default. A user may opt in to crediting a
**capped fraction** (default 50%, configurable, never 100%) as an explicit, informed setting.

**Why.** Two compounding errors make full credit actively harmful:

1. **Double counting.** TDEE already includes an activity multiplier. A user who selected
   "moderately active" has had their exercise counted once in the estimate. Adding logged exercise
   on top counts it twice. The MET formula also yields _gross_ expenditure, which includes the
   resting metabolic rate the user would have burned sitting still — already inside BMR. Net
   expenditure is roughly `(MET − 1) × 3.5 × kg / 200 × minutes`, and using gross overstates by
   10–25%.
2. **MET estimates are imprecise by construction.** Published MET values are population averages
   that ignore individual efficiency, fitness, terrain, and body composition. Real error bands on
   consumer activity-calorie estimates are wide — tens of percent, commonly biased high.

Compounded, a user eats back calories they never burned, fails to lose weight, cannot see why, and
loses trust in every number in the app. The honest default is "exercise is good for you; it is not
a food credit."

There is also a safety dimension. The opposite failure — a user exercising heavily and eating far
too little because the app never acknowledges their expenditure — is why the credit option exists
at all, capped and opt-in, rather than being absent.

**Alternatives.**

| Option                                                   | Trade-off                                                                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full auto-credit (MyFitnessPal's historical default)** | Feels rewarding; users like it. It is the single most criticized behaviour in that product and the direct cause of stalled-progress complaints.                                                                |
| **Never credit, no option**                              | Maximally honest and simple. Rejected: a genuinely high-volume athlete under-eating is a real harm, and a hard "no" drives them to an app that will lie to them.                                               |
| **Adaptive TDEE from observed intake vs. weight change** | The most accurate approach — it measures the individual rather than modelling them, and sidesteps MET error entirely. Requires ≥8 weeks of consistent data (`PRD.md` §4.2). This is the intended V2 direction. |

**When the alternative wins.** Once adaptive TDEE is available (V2) it should _supersede_ both the
multiplier and the credit mechanism — at which point this ADR is superseded, not amended.

**Display rule:** the UI never says "You burned 180 calories." It says "Estimated ~180 kcal
(net, MET-based)" with the source accessible.
