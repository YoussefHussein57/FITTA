# FITTA — Learning Journal

A record of what was taught, what was assessed, and what needs reinforcement. Entries are appended,
never rewritten — a journal that gets edited to look better is useless.

---

## Phase 00 — Product Discovery and Architecture

**Date:** 2026-10-28
**Code written:** none, by design
**Assessment status:** ⏸ pending

### What this phase was actually about

Phase 00 produced no code, and that is the lesson. The deliverable was a set of decisions that are
cheap to make now and expensive to change later. Three of them would have been effectively
unrecoverable if discovered during implementation:

1. **Nutrition snapshots (ADR-009).** If meal logs joined to the live catalog, the first catalog
   correction would silently rewrite every user's history. There is no migration that recovers the
   truth, because the truth was never stored.
2. **Provenance columns (DATA_MODEL §4).** Provenance cannot be added retroactively — you would be
   guessing where each number came from. And once an unknown value is written as `0`, it is
   indistinguishable from a real zero forever.
3. **Local-date bucketing (ADR-010).** Deriving the diary day from a UTC instant is wrong for
   everyone outside UTC+0, and fixing it later requires a timezone you never recorded.

Each of these is a _data_ decision, which is why the schema has to be reasoned about before the
screens that display it.

### Concepts introduced

| Concept                               | Where it lives | Why it matters here                                                            |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Transactional vs. reference data      | ADR-009        | A meal log is an invoice, not a view of a price list                           |
| Modular monolith vs. microservices    | ADR-002        | One transaction beats a saga when you have one developer                       |
| Server sessions vs. JWT               | ADR-005        | Revocation is a product requirement, and JWTs cannot do it                     |
| Two-layer authorization               | SECURITY §2.4  | A guard proves who; a query scope proves which rows                            |
| IDOR as the dominant risk             | RISKS RISK-01  | The leaf-update route is the shape of the bug                                  |
| 404 vs. 403 for non-owned resources   | SECURITY §2.2  | 403 confirms the resource exists                                               |
| NULL vs. zero in measurement data     | DATA_MODEL R6  | Honesty about missing data is a schema property                                |
| Arabic normalization + trigram search | ADR-012        | Stock PostgreSQL has no Arabic stemmer; FTS would look principled and not work |
| Derived vs. materialized aggregates   | ADR-008        | Do the arithmetic before adding a cache                                        |
| Named permissions vs. role booleans   | PRD §3.1       | "Admin" is how health data leaks                                               |
| Estimates vs. measurements            | ADR-013        | A labeled estimate is a product feature, not a disclaimer                      |
| Monorepo as contract enforcement      | ADR-006        | Typecheck as the integration test between apps                                 |

### The thing most likely to be misremembered later

That the snapshot decision is about _immutability_, not about _performance_. It is tempting to
summarize ADR-009 as "denormalize for speed", and that framing will produce the wrong answer the
first time there is pressure to normalize it back. The snapshot exists because history must not
change. Speed is incidental.

### Open threads carried forward

| Thread                                                                               | Resolves in                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Whether trigram ranking is good enough for real Egyptian queries                     | Phase 04, measured against a held-out query set |
| Whether calculated daily summaries stay inside the 50 ms budget at a year of history | Phase 05/10, measured                           |
| Whether the curated seed catalog is deep enough to avoid "food not found" churn      | Phase 04, measured after launch                 |

### Assessment

Four questions queued in `INTERVIEW_QUESTIONS.md` §Phase 00. Asked one at a time; answers recorded
here with a verdict (correct / partially correct / incorrect), the misconception if any, and whether
the concept re-enters the spaced-retrieval rotation.

| #    | Question                             | Attempt(s) | Verdict                   | Notes                                                                                                                                                                                 |
| ---- | ------------------------------------ | ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00.1 | Why own the food domain model        | 3          | ✅ Correct (3rd attempt)  | Started at latency, moved to cache staleness, then reached the real reason: the data does not exist upstream. Follow-up 00.1a (control over the model) answered correctly first time. |
| 00.2 | Why meal logs are separated per user | 1          | ⏸ **Deferred** by request | First attempt was circular — `user_id` framed as a lookup mechanism, not an enforcement mechanism. Re-ask at the Phase 02 gate where ownership is real code.                          |
| 00.3 | Why a modular monolith               | —          | ⏸ Not asked               |                                                                                                                                                                                       |
| 00.4 | Why schema before complex screens    | —          | ⏸ Not asked               |                                                                                                                                                                                       |

**Misconception to watch (from 00.1):** a reflex to explain architectural choices in terms of
_performance_ when the actual driver is _capability_ or _control_. Latency and staleness are real,
but both are solvable with a cache; the reason to own the model is that the Egyptian data, Arabic
names, and Egyptian portions do not exist in any upstream source. Worth probing again on a different
topic to see whether the pattern repeats.

**Carried into Phase 02:** question 00.2 re-asked against real code, where the `user_id` column and
the `where` clause are both visible and the difference between them is concrete rather than abstract.

**Implementation challenge (after the conceptual questions):** design the `meal_log_item` table
yourself — fields and types — such that a later catalog correction cannot alter a past entry, and a
nutrient with no known value is distinguishable from a nutrient measured at zero. Write it before
reading `DATA_MODEL.md` §6.
