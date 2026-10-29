# FITTA — API Inventory and Contracts

**Status:** Phase 00 inventory (shapes are indicative; exact DTOs are settled per phase)
**Last updated:** 2026-10-28

REST over HTTPS, JSON, documented with OpenAPI generated from NestJS DTOs (ADR-003). Request and
response schemas live in `packages/contracts` as Zod schemas and are the single source of truth for
both apps (ADR-006).

---

## 1. Global conventions

| Concern                    | Convention                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base path**              | `/api/v1`                                                                                                                                                  |
| **Auth**                   | Session cookie: `fitta_sid`, `HttpOnly; Secure; SameSite=Lax; Path=/` (ADR-005)                                                                            |
| **CSRF**                   | Double-submit token header `X-CSRF-Token` required on every `POST`/`PATCH`/`PUT`/`DELETE`                                                                  |
| **Ownership**              | `userId` is **never** a request parameter. It comes from the session (R2)                                                                                  |
| **`/me` prefix**           | Every user-owned resource lives under `/me/...`. This makes "did I scope this?" visible in the route itself                                                |
| **Not found vs forbidden** | A resource that exists but is not yours returns **404**. 403 is reserved for a _known_ resource class the caller's permissions exclude (e.g. admin routes) |
| **Pagination**             | Cursor-based: `?cursor=&limit=` (default 20, max 100). Response: `{ data, nextCursor }`                                                                    |
| **Dates**                  | Path/query dates are `YYYY-MM-DD` **local dates** (ADR-010). Instants are RFC 3339 UTC                                                                     |
| **Units**                  | Metric in every payload (ADR-011). Display conversion is the client's job                                                                                  |
| **Idempotency**            | `Idempotency-Key` honoured on meal-log and workout writes to survive retries on flaky mobile networks                                                      |
| **Request size**           | 256 KB JSON; 10 MB audio (V2)                                                                                                                              |

### Error envelope

```jsonc
{
  "error": {
    "code": "GOAL_RATE_EXCEEDS_SAFE_LIMIT", // stable machine string
    "message": "معدل النزول المطلوب أعلى من الحد الآمن.",
    "details": [{ "field": "rateKgPerWeek", "max": 0.85 }],
    "requestId": "01JD8...", // correlates to structured logs
  },
}
```

`code` is stable and is what clients branch on. `message` is localized and is for humans only.

| Status | Used for                                                            |
| ------ | ------------------------------------------------------------------- |
| 400    | Malformed request                                                   |
| 401    | No valid session                                                    |
| 403    | Authenticated, but the permission does not exist for this principal |
| 404    | Not found **or** not owned by the caller                            |
| 409    | Invariant conflict (e.g. a second `ACTIVE` goal)                    |
| 413    | Payload too large                                                   |
| 422    | Semantically invalid (e.g. unsafe calorie target)                   |
| 429    | Rate limited                                                        |

---

## 2. Inventory

Columns: **Auth** — `—` public, `S` session required, `P:x` permission required.
**V** — target version.

### 2.1 Authentication — D1

| Method | Path                           | Auth | Purpose                                          | V   |
| ------ | ------------------------------ | ---- | ------------------------------------------------ | --- |
| POST   | `/auth/register`               | —    | Create account, establish session                | 1   |
| POST   | `/auth/login`                  | —    | Authenticate, rotate session id                  | 1   |
| POST   | `/auth/logout`                 | S    | Revoke current session server-side               | 1   |
| GET    | `/auth/session`                | S    | Current principal + permissions                  | 1   |
| POST   | `/auth/password/reset-request` | —    | Send reset email (uniform response)              | 1   |
| POST   | `/auth/password/reset`         | —    | Consume token, set password, revoke all sessions | 1   |
| POST   | `/auth/email/verify`           | —    | Consume verification token                       | 1   |
| POST   | `/auth/email/verify/resend`    | S    | Re-send verification                             | 1   |
| GET    | `/auth/sessions`               | S    | List my active sessions                          | 1   |
| DELETE | `/auth/sessions/:id`           | S    | Revoke one of my sessions                        | 1   |
| DELETE | `/auth/sessions`               | S    | Revoke all other sessions                        | 1   |

**Rate limits:** `register` 5/h per IP · `login` 10/15 min per IP **and** per account, escalating ·
`reset-request` 3/h per IP and per email.

### 2.2 Profile, goals, energy — D2

| Method | Path                         | Auth | Purpose                                                                                    | V   |
| ------ | ---------------------------- | ---- | ------------------------------------------------------------------------------------------ | --- |
| GET    | `/me/profile`                | S    | Read my profile                                                                            | 1   |
| PUT    | `/me/profile`                | S    | Upsert profile (sex, birthDate, heightCm, activityLevel, locale, timezone, unitPreference) | 1   |
| GET    | `/me/goals`                  | S    | Goal history                                                                               | 1   |
| POST   | `/me/goals`                  | S    | Create goal — validates safety bounds, 409 if one is already `ACTIVE`                      | 1   |
| PATCH  | `/me/goals/:id`              | S    | Update or complete a goal                                                                  | 1   |
| GET    | `/me/targets/current`        | S    | Active calorie + macro target with its inputs                                              | 1   |
| GET    | `/me/targets?date=`          | S    | The target in force on a past date                                                         | 1   |
| POST   | `/public/calculators/bmi`    | —    | Ephemeral BMI — **persists nothing**                                                       | 1   |
| POST   | `/public/calculators/energy` | —    | Ephemeral BMR/TDEE — **persists nothing**                                                  | 1   |

**`POST /me/goals` — indicative shapes**

```jsonc
// request
{ "type": "LOSE_WEIGHT", "targetWeightKg": 78.0, "rateKgPerWeek": 0.5 }

// 201
{
  "id": "01JD...",
  "type": "LOSE_WEIGHT",
  "targetWeightKg": 78.0,
  "rateKgPerWeek": 0.5,
  "status": "ACTIVE",
  "target": {
    "bmrKcal": 1760, "tdeeKcal": 2420, "targetKcal": 1870,
    "proteinG": 145, "carbG": 180, "fatG": 62,
    "formula": "MIFFLIN_ST_JEOR",
    "estimated": true,                           // never omitted — PRD P4
    "disclaimer": "تقدير وليس قياس"
  }
}

// 422 — safety bound
{ "error": { "code": "CALORIE_TARGET_BELOW_SAFE_FLOOR",
             "details": [{ "requested": 1100, "floor": 1500 }] } }
```

### 2.3 Food catalog — D3 / D4

| Method | Path                                    | Auth               | Purpose                                              | V   |
| ------ | --------------------------------------- | ------------------ | ---------------------------------------------------- | --- |
| GET    | `/foods/search?q=&locale=&limit=`       | S                  | Normalized multi-script search (ADR-012)             | 1   |
| GET    | `/foods/:id`                            | S                  | Food detail with nutrients + provenance              | 1   |
| GET    | `/foods/:id/portions`                   | S                  | Egyptian portions with gram weights                  | 1   |
| GET    | `/food-categories`                      | S                  | Category tree                                        | 1   |
| GET    | `/nutrients`                            | S                  | Nutrient definitions and display order               | 1   |
| GET    | `/food-sources/:id`                     | S                  | Source, license, attribution                         | 1   |
| POST   | `/admin/foods`                          | P:`catalog:write`  | Create food                                          | 1   |
| PATCH  | `/admin/foods/:id`                      | P:`catalog:write`  | Edit food                                            | 1   |
| PUT    | `/admin/foods/:id/nutrients`            | P:`catalog:write`  | Replace nutrients (provenance required)              | 1   |
| PUT    | `/admin/foods/:id/portions`             | P:`catalog:write`  | Replace portions                                     | 1   |
| PUT    | `/admin/foods/:id/names`                | P:`catalog:write`  | Replace names (normalization recomputed server-side) | 1   |
| GET    | `/me/food-submissions`                  | S                  | My submissions                                       | 1.5 |
| POST   | `/me/food-submissions`                  | S                  | Submit a food for review                             | 1.5 |
| GET    | `/review/food-submissions`              | P:`content:review` | Moderation queue                                     | 1.5 |
| POST   | `/review/food-submissions/:id/decision` | P:`content:review` | Approve / reject                                     | 1.5 |

**`GET /foods/search` — indicative response**

```jsonc
{
  "data": [
    {
      "id": "01JD...",
      "name": { "ar": "كشري", "en": "Koshary" },
      "matchedOn": "COLLOQUIAL",
      "category": "أطباق مصرية",
      "state": "PREPARED",
      "per100g": { "energyKcal": 158, "proteinG": 4.6, "carbG": 28.1, "fatG": 3.2 },
      "provenance": {
        "tier": "RECIPE_CALCULATED",
        "confidence": "MEDIUM",
        "source": { "name": "FITTA recipe calculation", "attribution": "..." },
      },
      "defaultPortion": {
        "id": "01JD...",
        "labelAr": "طبق",
        "labelEn": "plate",
        "gramWeight": 420,
      },
    },
  ],
  "nextCursor": null,
}
```

Note the shape: **provenance travels with the nutrition, always.** It is not a separate lookup the
client might skip (PRD P2).

### 2.4 Recipes and portions — D5

| Method   | Path                              | Auth | Purpose                                        | V   |
| -------- | --------------------------------- | ---- | ---------------------------------------------- | --- |
| GET      | `/me/recipes`                     | S    | My recipes                                     | 1.5 |
| POST     | `/me/recipes`                     | S    | Create (nutrition derived, never supplied)     | 1.5 |
| GET      | `/me/recipes/:id`                 | S    | Detail — 404 if not mine                       | 1.5 |
| PATCH    | `/me/recipes/:id`                 | S    | Edit — bumps version, does not touch past logs | 1.5 |
| DELETE   | `/me/recipes/:id`                 | S    | Delete — past logs keep their snapshots        | 1.5 |
| GET      | `/recipes/templates`              | S    | Public templates                               | 1.5 |
| POST     | `/me/recipes/:id/publish-request` | S    | Request promotion (explicit consent)           | 1.5 |
| GET/POST | `/me/portions`                    | S    | My custom portions                             | 1.5 |

### 2.5 Meal logs and summaries — D6 / D7

| Method | Path                            | Auth | Purpose                                          | V   |
| ------ | ------------------------------- | ---- | ------------------------------------------------ | --- |
| GET    | `/me/diary?date=`               | S    | A full local day: entries, items, totals, target | 1   |
| POST   | `/me/meal-logs`                 | S    | Create entry (+ items in one transaction)        | 1   |
| GET    | `/me/meal-logs/:id`             | S    | Entry detail — **404 if not mine**               | 1   |
| PATCH  | `/me/meal-logs/:id`             | S    | Edit meal type / date / note                     | 1   |
| DELETE | `/me/meal-logs/:id`             | S    | Delete entry and its items                       | 1   |
| POST   | `/me/meal-logs/:id/items`       | S    | Add item — snapshot taken here                   | 1   |
| PATCH  | `/me/meal-log-items/:id`        | S    | Replace item (new snapshot)                      | 1   |
| DELETE | `/me/meal-log-items/:id`        | S    | Remove item                                      | 1   |
| GET    | `/me/nutrition/daily?date=`     | S    | One day's totals vs. that day's target           | 1   |
| GET    | `/me/nutrition/range?from=&to=` | S    | Range (max span 366 days)                        | 1   |
| GET    | `/me/meal-logs/recent-foods`    | S    | Frequently/recently logged, for fast re-logging  | 1   |

**`POST /me/meal-logs` — indicative request**

```jsonc
{
  "localDate": "2026-10-28",
  "timezone": "Africa/Cairo",
  "mealType": "LUNCH",
  "items": [
    { "sourceType": "FOOD", "foodId": "01JD...", "portionId": "01JD...", "portionCount": 1 },
    { "sourceType": "FOOD", "foodId": "01JE...", "quantityG": 150 },
  ],
}
```

**There is no `userId`.** Supplying one is rejected by `forbidNonWhitelisted` (NEG-02).
The server resolves `portionId + portionCount → quantityG`, computes the nutrient totals, and
writes the snapshot (ADR-009). The client never computes nutrition.

### 2.6 Body measurements — D8

| Method | Path                                   | Auth | Purpose                               | V   |
| ------ | -------------------------------------- | ---- | ------------------------------------- | --- |
| GET    | `/me/measurements?type=&from=&to=`     | S    | Series for one metric                 | 1   |
| POST   | `/me/measurements`                     | S    | Record a measurement                  | 1   |
| PATCH  | `/me/measurements/:id`                 | S    | Correct a measurement                 | 1   |
| DELETE | `/me/measurements/:id`                 | S    | Delete                                | 1   |
| GET    | `/me/measurements/trend?type=&window=` | S    | Smoothed series (labeled as smoothed) | 1   |
| POST   | `/me/progress-photos`                  | S    | Upload (encrypted, signed URL)        | 2   |

### 2.7 Exercise catalog — D9

| Method     | Path                                          | Auth              | Purpose                                                  | V   |
| ---------- | --------------------------------------------- | ----------------- | -------------------------------------------------------- | --- |
| GET        | `/exercises?muscleGroup=&equipment=&type=&q=` | S                 | Browse and filter                                        | 1   |
| GET        | `/exercises/:id`                              | S                 | Detail: muscles, equipment, instructions, licensed media | 1   |
| GET        | `/muscle-groups`                              | S                 | List                                                     | 1   |
| GET        | `/equipment`                                  | S                 | List                                                     | 1   |
| POST/PATCH | `/admin/exercises/...`                        | P:`catalog:write` | Curate                                                   | 1   |

### 2.8 Workouts and records — D10 / D11

| Method       | Path                             | Auth | Purpose                                              | V   |
| ------------ | -------------------------------- | ---- | ---------------------------------------------------- | --- |
| GET          | `/me/workouts?from=&to=`         | S    | Session history                                      | 1   |
| POST         | `/me/workouts`                   | S    | Start/create a session                               | 1   |
| GET          | `/me/workouts/:id`               | S    | Full session — 404 if not mine                       | 1   |
| PATCH        | `/me/workouts/:id`               | S    | Update status, duration, note                        | 1   |
| DELETE       | `/me/workouts/:id`               | S    | Delete session and children                          | 1   |
| POST         | `/me/workouts/:id/exercises`     | S    | Add an exercise to the session                       | 1   |
| PATCH/DELETE | `/me/workout-exercises/:id`      | S    | Reorder / remove — **re-verifies session ownership** | 1   |
| POST         | `/me/workout-exercises/:id/sets` | S    | Log a set — **re-verifies session ownership**        | 1   |
| PATCH/DELETE | `/me/sets/:id`                   | S    | Edit / delete a set                                  | 1   |
| GET          | `/me/records?exerciseId=`        | S    | Personal records (1RM labeled estimated)             | 1   |
| GET          | `/programs`, `/programs/:id`     | S    | Public program templates                             | 1.5 |
| POST         | `/me/enrollments`                | S    | Enrol — pins the program version                     | 1.5 |
| GET/PATCH    | `/me/enrollments/:id`            | S    | Progress / advance                                   | 1.5 |

> `/me/workout-exercises/:id` and `/me/sets/:id` are the two routes where the ownership path is two
> and three hops deep. They are the highest-risk routes in the inventory and have dedicated
> authorization tests (NEG-03).

### 2.9 Activities — D12

| Method       | Path                       | Auth | Purpose                                           | V   |
| ------------ | -------------------------- | ---- | ------------------------------------------------- | --- |
| GET          | `/activity-types?q=`       | S    | MET reference list with citations                 | 1   |
| GET          | `/me/activities?from=&to=` | S    | My activity log                                   | 1   |
| POST         | `/me/activities`           | S    | Log activity — returns a labeled **net** estimate | 1   |
| PATCH/DELETE | `/me/activities/:id`       | S    | Edit / delete                                     | 1   |

```jsonc
// 201 — note every field that enforces ADR-013
{
  "id": "01JD...",
  "estimatedKcal": 162,
  "estimationMethod": "MET_FORMULA",
  "basis": "NET",
  "metValue": 3.5,
  "confidence": "LOW",
  "estimated": true,
  "appliedToCalorieBudget": false,
  "source": { "name": "2024 Compendium of Physical Activities", "url": "..." },
}
```

### 2.10 Voice — D13 (V2)

| Method | Path                           | Auth | Purpose                                           | V   |
| ------ | ------------------------------ | ---- | ------------------------------------------------- | --- |
| POST   | `/me/voice/commands`           | S    | Upload audio (≤10 MB, ≤60 s) → transcript + draft | 2   |
| GET    | `/me/voice/drafts`             | S    | Pending drafts                                    | 2   |
| GET    | `/me/voice/drafts/:id`         | S    | Draft detail with proposed entities               | 2   |
| PATCH  | `/me/voice/drafts/:id`         | S    | Correct the proposal before approving             | 2   |
| POST   | `/me/voice/drafts/:id/approve` | S    | Commit via the **standard** write path            | 2   |
| POST   | `/me/voice/drafts/:id/reject`  | S    | Reject and purge audio                            | 2   |

There is no endpoint that writes a log directly from audio. The absence is the control.

### 2.11 Analytics — D15

| Method | Path                                      | Auth | Purpose                                  | V   |
| ------ | ----------------------------------------- | ---- | ---------------------------------------- | --- |
| GET    | `/me/analytics/weight-trend?window=`      | S    | EMA-smoothed weight series               | 1   |
| GET    | `/me/analytics/adherence?from=&to=`       | S    | Days on/over/under the applicable target | 1   |
| GET    | `/me/analytics/macros?from=&to=`          | S    | Macro distribution                       | 1   |
| GET    | `/me/analytics/training-volume?from=&to=` | S    | Volume and frequency by muscle group     | 1   |

Every response carries `{ method, window, sufficientData: boolean }`. When `sufficientData` is
false the client renders "not enough data yet", never a number (DATA_MODEL §15).

### 2.12 Account, privacy, platform

| Method | Path             | Auth         | Purpose                                              | V   |
| ------ | ---------------- | ------------ | ---------------------------------------------------- | --- |
| POST   | `/me/export`     | S            | Request a full personal-data export                  | 1   |
| GET    | `/me/export/:id` | S            | Download via expiring signed link                    | 1   |
| DELETE | `/me/account`    | S            | Delete account (confirmation required, irreversible) | 1   |
| GET    | `/health`        | —            | Liveness                                             | 1   |
| GET    | `/ready`         | —            | Readiness (DB reachable)                             | 1   |
| GET    | `/docs`          | — (non-prod) | OpenAPI UI                                           | 1   |

---

## 3. Contract ownership

```
packages/contracts/src/
├── auth/        # loginRequest, sessionResponse, ...
├── profile/
├── food/        # foodSearchResult, provenance, portion
├── meal-log/    # createMealLogRequest, mealLogItem, nutrientSnapshot
├── measurement/
├── workout/
├── activity/
├── analytics/
└── common/      # errorEnvelope, pagination, localDate, provenanceTier
```

One Zod schema per shape. The backend derives its DTO validation from it; the frontend derives its
TypeScript types from it. A breaking change fails `pnpm typecheck` across both apps in the same
commit — the reason ADR-006 chose a monorepo.

## 4. Contract invariants (enforced by review and tests)

1. No request DTO declares a `userId`, anywhere. An architectural test asserts this.
2. Every nutrition-bearing response includes provenance.
3. Every estimate-bearing response includes `estimated: true` plus its method.
4. Every list endpoint is paginated and span-bounded.
5. Every mutating endpoint requires a CSRF token.
6. Error `code` values are append-only — never repurposed once shipped.
