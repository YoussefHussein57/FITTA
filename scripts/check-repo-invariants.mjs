#!/usr/bin/env node
/**
 * Repository-level invariants, asserted mechanically.
 *
 * These are rules a reviewer is supposed to remember. Rules people remember are
 * rules that hold until the one time they do not, so each is checked here and
 * wired into CI.
 *
 * Exit codes: 0 all invariants hold, 1 at least one violated.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const failures = [];
const checks = [];

function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
    failures.push(name);
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

function walk(dir, predicate, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next' || entry === '.git') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, predicate, found);
    } else if (predicate(full)) {
      found.push(full);
    }
  }
  return found;
}

const PACKAGE_FILES = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/contracts/package.json',
  'packages/config/package.json',
];

/**
 * Acceptance case 11. `prisma migrate reset` and `docker compose down -v` both
 * destroy data. Either is fine to have; neither may be reachable from a command
 * someone runs routinely, so both must be named so the consequence is obvious.
 */
check('no unmarked destructive npm script', () => {
  const destructive =
    /migrate\s+reset|down\s+-v|drop\s+database|db\s+push\s+--force|--force-reset/i;
  const offenders = [];

  for (const file of PACKAGE_FILES) {
    const scripts = readJson(file).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== 'string') continue;
      if (destructive.test(command) && !/DESTRUCTIVE/.test(name)) {
        offenders.push(`${file} :: ${name}`);
      }
    }
  }

  if (offenders.length > 0) {
    throw new Error(`destructive command not named DESTRUCTIVE:\n    ${offenders.join('\n    ')}`);
  }
  return 'all destructive scripts explicitly named';
});

/** A destructive script must never be invoked by another script. */
check('no script invokes a DESTRUCTIVE script', () => {
  const offenders = [];

  for (const file of PACKAGE_FILES) {
    const scripts = readJson(file).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== 'string' || /DESTRUCTIVE/.test(name)) continue;
      if (/DESTRUCTIVE/.test(command)) offenders.push(`${file} :: ${name}`);
    }
  }

  if (offenders.length > 0) {
    throw new Error(`calls a DESTRUCTIVE script:\n    ${offenders.join('\n    ')}`);
  }
  return 'no indirect path to a destructive command';
});

/**
 * docs/SECURITY.md §5. Anything prefixed NEXT_PUBLIC_ is inlined into the
 * browser bundle and is public by definition. A secret-shaped name behind that
 * prefix is a leak, not a configuration choice.
 */
check('no secret-shaped NEXT_PUBLIC_ variable', () => {
  const secretish = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|PRIVATE)/;
  const sources = walk(ROOT, (f) => /\.(ts|tsx|mjs|js)$/.test(f) || /\.env\.example$/.test(f));
  const offenders = [];

  for (const file of sources) {
    const content = readFileSync(file, 'utf8');
    // Skip this script's own pattern definition.
    if (file.endsWith('check-repo-invariants.mjs')) continue;
    if (secretish.test(content)) offenders.push(relative(ROOT, file));
  }

  if (offenders.length > 0) {
    throw new Error(`secret exposed to the browser bundle:\n    ${offenders.join('\n    ')}`);
  }
  return 'no secret-shaped public variable';
});

/**
 * docs/SECURITY.md §4 / ARCHITECTURE.md §7.3. Lint already bans the Unsafe raw
 * SQL calls; this catches the same mistake written as string concatenation
 * inside an otherwise-tagged template, which the AST rule does not see.
 */
check('no string-concatenated SQL', () => {
  const sources = walk(ROOT, (f) => /\.ts$/.test(f) && !/\.spec\.ts$/.test(f));
  const offenders = [];

  for (const file of sources) {
    const content = readFileSync(file, 'utf8');
    if (/\$queryRawUnsafe|\$executeRawUnsafe/.test(content)) {
      offenders.push(relative(ROOT, file));
    }
  }

  if (offenders.length > 0) {
    throw new Error(`unsafe raw SQL:\n    ${offenders.join('\n    ')}`);
  }
  return 'no unsafe raw SQL helpers in use';
});

/**
 * ARCHITECTURE.md §3.2 — the single most important rule in the codebase.
 *
 * Ownership comes from the session, never from the request. A DTO carrying a
 * `userId` is a complete authorization bypass that reads as ordinary code.
 *
 * There are no DTOs yet (Phase 02 introduces them). The check runs now so the
 * harness exists before the first one is written rather than after.
 */
check('no request DTO declares userId', () => {
  const dtoFiles = walk(ROOT, (f) => /\.dto\.ts$/.test(f));
  const offenders = [];

  for (const file of dtoFiles) {
    const content = readFileSync(file, 'utf8');
    if (/^\s*(readonly\s+)?userId[?!]?\s*:/m.test(content)) {
      offenders.push(relative(ROOT, file));
    }
  }

  if (offenders.length > 0) {
    throw new Error(`DTO declares userId — ownership must come from the session:
    ${offenders.join('\n    ')}`);
  }
  return `${dtoFiles.length.toString()} DTO file(s) scanned, none declare userId`;
});

for (const { name, ok, detail } of checks) {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length.toString()} repository invariant(s) violated.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length.toString()} repository invariants hold.`);
