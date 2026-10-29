# FITTA — Security, Authorization, and Privacy

**Status:** Phase 00 policy, awaiting approval
**Last updated:** 2026-10-28

FITTA stores special-category health data about identifiable people. This document is a
specification, not advice: every rule here is testable, and `TEST_STRATEGY.md` §4 says how.

---

## 1. Data classification

| Class                            | Examples                                                                                                                | Handling                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C3 — Special-category health** | Weight, body measurements, body fat, meal history, calorie targets, sex, birth date, voice transcripts, progress photos | Never logged. Encrypted in transit and at rest. Strict user scoping. Included in export. Deleted on account deletion. Never in an error message, analytics event, or URL |
| **C2 — Authentication secrets**  | Passwords, session tokens, reset tokens, CSRF tokens, provider API keys                                                 | Never logged, never returned in any response, never in a URL. Stored hashed where they are verifiers, not identifiers                                                    |
| **C1 — Personal identifiers**    | Email, IP address, user agent                                                                                           | Logged only in hashed or truncated form. In export. Deleted or anonymized on deletion                                                                                    |
| **C0 — Global catalog**          | Foods, nutrients, portions, exercises, MET values                                                                       | Readable by any authenticated user. Not personal data                                                                                                                    |

**The rule that follows from this table:** a response or log line containing a C3 value outside an
authenticated, user-scoped context is an incident, not a bug.

---

## 2. Authorization model

### 2.1 Principals and permissions

Permissions are named and independently grantable. There is **no** `isAdmin` boolean (PRD §3.1).

| Permission             | Grants                                                   | Granted to in V1                                 |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| _(session only)_       | Full CRUD over **your own** data                         | Every registered user                            |
| `catalog:write`        | Create/edit global foods, exercises, nutrients, portions | Catalog administrator                            |
| `content:review`       | Approve/reject community submissions                     | Content reviewer (V1.5)                          |
| `support:read_user`    | Read another user's C3 data                              | **Nobody. This permission is not granted in V1** |
| `trainer:read:<scope>` | Read a specific slice of a specific consenting client    | Nobody (V2)                                      |

> A catalog administrator who edits the gram weight of baladi bread cannot read any user's weight
> history. These capabilities are deliberately unbundled, because bundling them is how fitness apps
> leak health data.

### 2.2 Authorization matrix

`✓` allowed · `✗` denied · `404` denied by returning not-found (existence is not confirmed) ·
`own` own rows only

| Resource                        | Guest         | User (own) | User (other's) | Catalog admin | Content reviewer                        | Trainer (granted, V2)                        |
| ------------------------------- | ------------- | ---------- | -------------- | ------------- | --------------------------------------- | -------------------------------------------- |
| Marketing pages                 | ✓             | ✓          | —              | ✓             | ✓                                       | ✓                                            |
| Ephemeral calculators           | ✓             | ✓          | —              | ✓             | ✓                                       | ✓                                            |
| Food catalog (read)             | ✓ _(limited)_ | ✓          | —              | ✓             | ✓                                       | ✓                                            |
| Exercise catalog (read)         | ✓ _(limited)_ | ✓          | —              | ✓             | ✓                                       | ✓                                            |
| Food catalog (write)            | ✗             | ✗          | ✗              | ✓             | ✗                                       | ✗                                            |
| Exercise catalog (write)        | ✗             | ✗          | ✗              | ✓             | ✗                                       | ✗                                            |
| Own profile / goals             | ✗             | ✓ own      | 404            | ✗             | ✗                                       | read if `profile` scope                      |
| Meal logs                       | ✗             | ✓ own      | 404            | **✗**         | ✗                                       | read if `nutrition` scope                    |
| Daily summaries                 | ✗             | ✓ own      | 404            | **✗**         | ✗                                       | read if `nutrition` scope                    |
| Body measurements               | ✗             | ✓ own      | 404            | **✗**         | ✗                                       | read if `body` scope                         |
| Progress photos (V2)            | ✗             | ✓ own      | 404            | **✗**         | ✗                                       | **never** — excluded from all trainer scopes |
| Workout sessions                | ✗             | ✓ own      | 404            | ✗             | ✗                                       | read if `training` scope                     |
| Personal records                | ✗             | ✓ own      | 404            | ✗             | ✗                                       | read if `training` scope                     |
| Activity logs                   | ✗             | ✓ own      | 404            | ✗             | ✗                                       | read if `training` scope                     |
| Private recipes                 | ✗             | ✓ own      | 404            | ✗             | ✗                                       | ✗                                            |
| Submitted recipe/food content   | ✗             | ✓ own      | 404            | ✗             | ✓ _(content only, pseudonymous author)_ | ✗                                            |
| Voice drafts / transcripts (V2) | ✗             | ✓ own      | 404            | ✗             | ✗                                       | **never**                                    |
| Sessions list / revocation      | ✗             | ✓ own      | 404            | ✗             | ✗                                       | ✗                                            |
| Data export                     | ✗             | ✓ own      | 404            | ✗             | ✗                                       | ✗                                            |
| Account deletion                | ✗             | ✓ own      | 404            | ✗             | ✗                                       | ✗                                            |

Bold `✗` marks the rows where an "admin can see everything" instinct would be wrong.

### 2.3 Trainer access rules (V2, specified now so the model is not retrofitted)

1. A trainer–client relationship grants **nothing**. Access comes only from an explicit, itemized
   grant by the client.
2. Scopes are independent and individually revocable: `profile`, `nutrition`, `body`, `training`.
3. Every grant has an expiry. There is no perpetual grant.
4. Revocation is immediate and unilateral by the client.
5. Every trainer read of client data writes an access-audit record the client can view.
6. Progress photos and voice transcripts are **never** within any trainer scope.
7. A trainer may never write to a client's logs — only propose, with the client approving (the same
   draft pattern as voice).

### 2.4 Enforcement, in two mandatory layers

```
Layer 1 — Guard:    Is there a valid session? Does the principal hold the required permission?
Layer 2 — Query:    Does every `where` on a user-owned table include userId from the session?
```

Layer 2 is not redundant. A guard proves _who you are_. It cannot know that `workoutId=abc` belongs
to someone else — only the query can. Both layers are required on every user-owned route.

**The source-of-truth rule:** `userId` comes from `@CurrentUser()`. Not from the body, not from the
query string, not from the path, not from a header. A DTO containing `userId` is a defect, and an
architectural test asserts none exists.

---

## 3. Authentication

| Control          | Specification                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing | **Argon2id**, memory ≥ 64 MiB, iterations ≥ 3, parallelism 1–4, per-password salt. Parameters stored with the hash so they can be raised later                        |
| Password policy  | ≥ 10 characters; checked against a common-password list; no composition rules (they reduce entropy in practice); no forced rotation                                   |
| Session token    | ≥ 256 bits from a CSPRNG. Opaque. Stored **hashed** — a database read yields no usable session                                                                        |
| Cookie           | `HttpOnly; Secure; SameSite=Lax; Path=/`. No domain wildcard                                                                                                          |
| Lifetime         | 14-day absolute; 7-day idle. Both enforced server-side                                                                                                                |
| Session fixation | A new session id is issued on every authentication; any pre-auth id is invalidated                                                                                    |
| Revocation       | Logout revokes server-side. Password reset revokes **all** sessions                                                                                                   |
| Enumeration      | Register, login, and reset-request return identical shape, status, and timing distribution. Argon2 verification runs even for unknown emails, against a dummy hash    |
| Brute force      | Per-IP and per-account limits with escalating delay. Lockout is time-based, never permanent (a permanent lockout is a denial-of-service vector against a known email) |
| MFA              | Not in V1. The schema reserves room so it is additive                                                                                                                 |

---

## 4. Transport, input, and output

| Control          | Specification                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TLS              | HTTPS only. HSTS with a long max-age in production                                                                                                                    |
| CSRF             | Double-submit token on every state-changing method, plus `SameSite=Lax`. Both, because `SameSite` is a defence-in-depth measure and not a complete one                |
| Input validation | Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true`. Unknown fields are **rejected**, which is also a mass-assignment defence |
| Request size     | 256 KB JSON; 10 MB audio (V2); 413 beyond                                                                                                                             |
| Query bounds     | Every list endpoint paginated (max 100); every range endpoint span-bounded (max 366 days)                                                                             |
| SQL injection    | Prisma parameterizes by default. `$queryRaw` must use tagged-template parameters. **String-concatenated SQL is a blocking review failure** (ADR-004)                  |
| XSS              | React escapes by default. `dangerouslySetInnerHTML` is forbidden without a documented exception and sanitization                                                      |
| Security headers | CSP (no `unsafe-inline` in production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`                |
| CORS             | Same-origin in production. The allowlist is explicit, never reflected from `Origin`                                                                                   |
| File upload (V2) | Type and magic-byte validation, size cap, stored outside the web root, served only via short-lived signed URLs, never with a user-controlled filename                 |
| Rate limiting    | Global per-IP, plus stricter per-route on auth, search, export, and voice                                                                                             |

---

## 5. Secrets and configuration

- All configuration is validated at boot with Zod. **The process refuses to start on an invalid or
  missing secret** — a missing `SESSION_SECRET` must be a crash, not a silent default.
- No secret is ever bundled into the frontend. Anything reaching the browser is public by
  definition, including `NEXT_PUBLIC_*`.
- Provider credentials live only in `apps/api`, used only by that provider's adapter.
- `.env` is never committed. `.env.example` documents every key with a non-secret placeholder.
- Database credentials are least-privilege: the application role has DML rights and no DDL rights in
  production; migrations run under a separate role.

---

## 6. Logging and observability

**Never logged, under any circumstance:**

- Passwords, password hashes, session tokens, reset tokens, CSRF tokens, provider API keys.
- Any C3 health value: weight, measurements, calories, meal contents, voice transcripts.
- Raw audio, ever.
- Full email addresses (hash or mask), full IP addresses (hash or truncate).

**Always logged:** request id, route, status, duration, user id (an opaque identifier is not health
data), and error codes.

The redaction allowlist is implemented as an interceptor and **tested** (NFR-12): a unit test feeds
an object containing every forbidden key and asserts the emitted line contains none of them. A
redactor that is not tested is a redactor that silently stops working after a refactor.

---

## 7. Privacy and retention policy

### 7.1 Legal posture

Egypt's Personal Data Protection Law (Law 151/2018) treats health data as sensitive and requires a
lawful basis, explicit consent for sensitive categories, and data-subject rights. GDPR Article 9
reaches the same conclusion for any EU users. FITTA is designed to the stricter of the two.

**Lawful basis:** explicit consent, obtained at registration for core tracking, and obtained
_separately_ for each of: voice processing, progress photos, and trainer sharing. Bundled consent is
not consent.

### 7.2 Retention schedule

| Data                                          | Retention                                                             | Rationale                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Account + profile                             | While the account is active                                           | Service delivery                                                              |
| Meal logs, measurements, workouts, activities | While active, plus 30 days after deletion request                     | The 30-day window is an accident-recovery grace period, disclosed to the user |
| Sessions                                      | Until expiry or revocation; rows purged 30 days after expiry          | Audit                                                                         |
| Auth events                                   | 12 months                                                             | Security investigation                                                        |
| Password reset / verification tokens          | Purged on consumption or expiry                                       | No reason to keep a spent token                                               |
| **Raw voice audio**                           | **Not retained by default.** With explicit opt-in: ≤7 days, encrypted | Minimization — the transcript is the product, the audio is not                |
| Voice transcripts                             | With the resulting log entry; deletable independently                 | User control                                                                  |
| Progress photos (V2)                          | While active; deleted immediately on request                          | Highest sensitivity                                                           |
| Export archives                               | 7 days, then purged                                                   | They are a complete C3 dump and must not linger                               |
| Application logs                              | 30 days                                                               | Operations                                                                    |
| Backups                                       | 30 days, encrypted                                                    | Deletion propagates at the next backup cycle; disclosed                       |

### 7.3 Data-subject rights

| Right                       | Implementation                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Access / portability**    | `POST /me/export` → machine-readable archive of all user-owned data, delivered via an expiring authenticated link, 7-day retention                                                                         |
| **Rectification**           | Every user-owned record is editable. Note that meal-log _snapshots_ are immutable by design (ADR-009); correcting an entry replaces the item rather than mutating history, and this is explained in the UI |
| **Erasure**                 | `DELETE /me/account` — confirmed and irreversible. C3 rows are hard-deleted within 30 days; C1 identifiers anonymized; backups age out within 30 days                                                      |
| **Restriction / objection** | Account deactivation without deletion                                                                                                                                                                      |
| **Withdraw consent**        | Per-purpose toggles for voice, photos, and trainer sharing. Withdrawal is immediate and revokes the associated grants                                                                                      |

### 7.4 What happens to catalog contributions on deletion

A community-submitted food that was approved into the public catalog stays — it is now shared
reference data that other users' histories depend on. The **link to its author is severed**
(`created_by_user_id → NULL`) and the submitter is no longer identifiable. This is disclosed at
submission time, not discovered at deletion time.

### 7.5 Minimization decisions already made

- Age is **derived** from birth date, never stored. (We need the number; we store the fact.)
- IP addresses are hashed, never stored raw.
- Food search queries are **not** logged with a user id — a query log is a dietary and religious
  profile.
- Voice audio is not retained by default.
- No third-party analytics or advertising SDK in the authenticated app. A page-view beacon on a
  health screen leaks the screen name, which leaks the condition.

---

## 8. Threat model (STRIDE, abbreviated to what is real here)

| Threat                     | Vector                                                       | Mitigation                                                                                   |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Spoofing**               | Credential stuffing; session theft                           | Argon2id, rate limits, `HttpOnly` cookies, revocation                                        |
| **Tampering**              | Client-supplied `userId`; mass assignment; unexpected fields | No `userId` in DTOs; `forbidNonWhitelisted`; server-computed nutrition                       |
| **Repudiation**            | "I didn't log that"                                          | `AuthEvent` audit trail; immutable snapshots                                                 |
| **Information disclosure** | **IDOR on meal logs and workout sets** — the top risk        | Two-layer authorization; 404 for non-owned; non-sequential ids; NEG-01…04 as mandatory tests |
|                            | Account enumeration                                          | Uniform responses and timing                                                                 |
|                            | Health data in logs                                          | Tested redaction allowlist                                                                   |
|                            | Aggregate leakage via analytics                              | User-scoped queries; k-anonymity before any cross-user feature                               |
| **Denial of service**      | Unbounded range queries; large uploads; expensive search     | Span caps, size limits, rate limits, indexed search                                          |
| **Elevation of privilege** | "Admin sees everything"                                      | Named permissions; `support:read_user` ungranted                                             |
|                            | Nested-resource authorization gap                            | Ownership re-verified at the aggregate root on every nested write                            |

### 8.1 The two highest-risk routes in the product

`PATCH /me/sets/:id` and `PATCH /me/meal-log-items/:id`. Both operate on a leaf whose owner is two
or three hops away. The tempting implementation —
`prisma.exerciseSet.update({ where: { id } })` — is a complete authorization bypass that reads as
perfectly normal code and passes every functional test. Every such route gets an explicit
cross-user test.

---

## 9. Security review checklist (applied to every phase)

- [ ] Every new user-owned table has a non-null `user_id` and an index leading with it.
- [ ] Every new endpoint appears in the §2.2 matrix.
- [ ] No new DTO contains `userId`.
- [ ] Every new mutating endpoint requires CSRF.
- [ ] Every new list/range endpoint is bounded.
- [ ] Every new `$queryRaw` uses tagged-template parameters.
- [ ] No new C3 value reaches a log line.
- [ ] Cross-user negative tests exist for every new owned resource.
- [ ] Non-owned access returns 404, not 403.
- [ ] New external calls go through an adapter with a timeout, and the secret stays server-side.
