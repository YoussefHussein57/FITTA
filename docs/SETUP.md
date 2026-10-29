# FITTA — Fresh Machine Setup

Written for Windows first, since that is the primary development machine. macOS
and Linux notes are inline where the commands differ.

---

## 1. Prerequisites

| Tool           | Version | Check              | Notes                                       |
| -------------- | ------- | ------------------ | ------------------------------------------- |
| Node.js        | 22.20.0 | `node --version`   | Pinned in `.nvmrc` and `engines`            |
| pnpm           | ≥ 11    | `pnpm --version`   | Pinned in `packageManager`. `npm i -g pnpm` |
| Docker Desktop | ≥ 28    | `docker --version` | Must be **running** before `pnpm db:up`     |
| Git            | ≥ 2.40  | `git --version`    |                                             |

A local PostgreSQL install is **not** required. The project runs its own in
Docker, on non-default ports precisely so it cannot collide with one.

## 2. Setup — four commands

```bash
git clone https://github.com/YoussefHussein57/FITTA.git
cd FITTA

pnpm install                              # 1. dependencies
cp .env.example apps/api/.env             # 2. API configuration
                                          #    PowerShell: Copy-Item .env.example apps\api\.env
pnpm db:up                                # 3. PostgreSQL (dev + test containers)
pnpm db:deploy                            # 4. apply migrations
```

The web app needs one line of its own:

```bash
echo "API_BASE_URL=http://localhost:3001" > apps/web/.env.local
```

Verify everything landed:

```bash
pnpm env:check      # prints "Environment OK" or names every invalid key
pnpm db:status      # "Database schema is up to date!"
pnpm verify         # format, build, typecheck, lint, repo invariants, unit tests
```

## 3. Running the apps

Two terminals, because each process owns its own output:

```bash
# terminal 1 — API on :3001
pnpm --filter @fitta/api run build
pnpm --filter @fitta/api run start

# terminal 2 — web on :3000
pnpm --filter @fitta/web run dev
```

| URL                                 | What it is                               |
| ----------------------------------- | ---------------------------------------- |
| http://localhost:3000/ar            | Landing page, Arabic (RTL) — the default |
| http://localhost:3000/en            | Landing page, English (LTR)              |
| http://localhost:3000/ar/status     | Live backend status through the proxy    |
| http://localhost:3001/api/v1/health | Liveness                                 |
| http://localhost:3001/api/v1/ready  | Readiness (503 when PostgreSQL is down)  |
| http://localhost:3001/docs          | OpenAPI UI (non-production only)         |

For API development with auto-reload, run `build:watch` and `start:watch` in two
terminals rather than `start`.

## 4. Ports

Chosen around what the primary development machine already runs. **Changing them
is a `docker-compose.yml` edit plus a matching `DATABASE_URL`.**

| Port     | Service                      | Why not the obvious one                            |
| -------- | ---------------------------- | -------------------------------------------------- |
| 3000     | Next.js                      |                                                    |
| 3001     | NestJS                       |                                                    |
| **5433** | PostgreSQL — **development** | 5432 is taken by a locally installed PostgreSQL 17 |
| **5435** | PostgreSQL — **test**        | 5434 is taken by another project's container stack |

A port clash here fails in the worst possible way: by silently connecting the
app to someone else's database.

## 5. Testing

```bash
pnpm test               # unit — fast, no database required
pnpm test:integration   # integration — needs `pnpm db:up`
pnpm test:e2e           # Playwright — starts the built API and web itself
pnpm check:repo         # repository invariants
pnpm verify             # everything except integration and e2e
```

First E2E run only:

```bash
pnpm --filter @fitta/web exec playwright install chromium
```

### What each layer protects

| Layer       | Guards                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Unit        | Config validation, including that error messages never echo a secret value                                  |
| Integration | Migrations, extensions, **Arabic trigram similarity (ADR-012a)**, readiness 503, error envelope, body limit |
| E2E         | The whole stack end to end, RTL/LTR, mobile viewport, keyboard reachability                                 |
| Repo checks | No unmarked destructive script, no secret-shaped `NEXT_PUBLIC_`, no `userId` in a DTO                       |

## 6. Database commands

```bash
pnpm db:up        # start both containers
pnpm db:down      # stop containers — DATA SURVIVES
pnpm db:ps        # status
pnpm db:logs      # follow logs
pnpm db:deploy    # apply existing migrations (non-interactive; use in CI)
pnpm db:migrate   # create a new migration from schema changes (development)
pnpm db:status    # pending vs applied
```

### Destructive commands

These delete data. Both are named so the consequence is visible at the call
site, and `pnpm check:repo` fails the build if a destructive command ever hides
behind an innocuous name.

```bash
pnpm db:nuke:DESTRUCTIVE                            # delete BOTH volumes
pnpm --filter @fitta/api run db:reset:DESTRUCTIVE   # drop and recreate the schema
```

`pnpm db:down` is safe — it stops containers and leaves the named volumes alone.

## 7. Troubleshooting

**`pnpm db:up` fails with a Docker API error**
Docker Desktop is not running. Start it, wait for the whale icon to settle, retry.

**`Bind for 0.0.0.0:5433 failed: port is already allocated`**
Something else owns the port. Find it:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5433 |
  ForEach-Object { Get-Process -Id $_.OwningProcess }
```

**`EPERM: operation not permitted, rename ... query_engine-windows.dll.node`**
A Node process still has the Prisma engine loaded — Windows locks loaded DLLs.
Stop any running API process and rebuild:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*dist/main.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**API exits immediately with "Invalid environment configuration"**
Working as designed. Every invalid key is listed. `apps/api/.env` is missing or
incomplete — compare against `.env.example`.

**`/api/v1/ready` returns 503**
Also working as designed: the API is alive, PostgreSQL is not reachable. Run
`pnpm db:ps`. The API recovers on its own once the database is back; no restart
needed.

**Arabic food search finds nothing (Phase 04 onward)**
Check the database locale before anything else:

```bash
docker exec fitta-postgres-dev psql -U fitta -d fitta_dev \
  -c "SELECT datctype FROM pg_database WHERE datname=current_database();"
```

It must contain `UTF-8`. Under `C`, `pg_trgm` discards every Arabic character
and similarity collapses to 0 with no error anywhere (ADR-012a). Fixing it means
recreating the volume:

```bash
docker compose rm -sf postgres-dev
docker volume rm fitta_fitta-pgdata-dev     # destroys development data
docker compose up -d postgres-dev
pnpm db:deploy
```

**Playwright fails to start a server**
Both apps must be built first: `pnpm run build`. Playwright starts the
**production** builds, not dev servers, so a stale build is a stale test.

## 8. Workspace layout and how imports resolve

```
FITTA/
├── apps/api        @fitta/api       NestJS + Prisma
├── apps/web        @fitta/web       Next.js App Router
├── packages/contracts  @fitta/contracts   Zod schemas — the API contract
└── packages/config     @fitta/config      tsconfig / eslint / prettier
```

`pnpm-workspace.yaml` declares `apps/*` and `packages/*` as workspace members. A
dependency written `"@fitta/contracts": "workspace:*"` is **symlinked** from the
local folder rather than fetched from a registry, so an edit there is visible to
both apps immediately — no publish, no version bump.

Two consequences worth understanding:

1. **`packages/contracts` must be built before the apps typecheck**, because its
   `package.json` points `types` at `dist/`. `pnpm --recursive` runs tasks in
   dependency order automatically, which is why `pnpm run build` works from the
   root with no manual sequencing.

2. **pnpm's `node_modules` is isolated, not flat.** A package can only import
   what it declares. This already caught one real bug: `apps/api` imported
   `express` while declaring only `@types/express`, resolving transitively
   through `@nestjs/platform-express`. npm's flat layout would have let that work
   locally and fail on a different machine.

### Command orchestration

| Command                 | Runs                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm run build`        | `--recursive --sequential`, dependency order: config → contracts → api → web |
| `pnpm run typecheck`    | Each package's own `tsc`                                                     |
| `pnpm run lint`         | One ESLint pass from the root over everything                                |
| `pnpm --filter <pkg> …` | One package; resolves the workspace from any directory                       |

Linting runs **once**, from the root. `next build` has its own ESLint pass; it is
disabled (`eslint.ignoreDuringBuilds`) so there is one linter and one config
rather than two that can disagree.

## 9. Install-script policy

pnpm blocks dependency lifecycle scripts by default — a postinstall runs
arbitrary code from the registry. Each exception in `pnpm-workspace.yaml` is a
deliberate trust decision:

| Package                                       | Allowed | Why                                                                                              |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `prisma`, `@prisma/client`, `@prisma/engines` | ✅      | Fetch the query engine binary; non-functional without it                                         |
| `@swc/core`, `esbuild`                        | ✅      | Native binaries backing the test toolchain                                                       |
| `@scarf/scarf`                                | ❌      | Install analytics pulled in by NestJS. Reports telemetry to a third party; nothing here needs it |

If `pnpm install` reports a new ignored build script, that is a decision to make
deliberately — not a prompt to dismiss.
