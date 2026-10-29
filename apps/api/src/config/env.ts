import { z } from 'zod';

/**
 * Validated application configuration.
 *
 * Two rules govern this file (docs/SECURITY.md §5):
 *
 *  1. There are no silent defaults for anything that carries a secret or points
 *     at infrastructure. A missing DATABASE_URL must crash the process, not fall
 *     back to localhost — a server that quietly starts against the wrong database
 *     is worse than one that refuses to start.
 *
 *  2. Validation failures report the *key* and the *reason*, never the value.
 *     Connection strings contain passwords, and an error message is a log line.
 */

const POSTGRES_URL = /^postgres(ql)?:\/\//;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Port the API listens on. Configurable so a busy port is not a blocker. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  /** No default: see rule 1 above. */
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .refine((value) => POSTGRES_URL.test(value), {
      message: 'must be a postgres:// or postgresql:// connection string',
    }),

  /**
   * Origin allowed to call the API directly. In normal operation the browser
   * reaches the API through the Next.js proxy and is same-origin, so this exists
   * for deliberate direct access only (ADR-007). Never reflected from the
   * request's Origin header.
   */
  WEB_ORIGIN: z
    .string()
    .min(1)
    .refine((value) => /^https?:\/\//.test(value), {
      message: 'must be an http:// or https:// origin',
    })
    .default('http://localhost:3000'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  public readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[], report: string) {
    super(report);
    this.name = 'EnvValidationError';
    this.invalidKeys = invalidKeys;
  }
}

/**
 * Parses and validates configuration.
 *
 * Throws {@link EnvValidationError} listing every invalid key — all of them, not
 * just the first. Fixing configuration one restart at a time is miserable, and
 * the information is free.
 *
 * @param source defaults to `process.env`; injectable so tests need no globals.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const keys: string[] = [];
  const lines: string[] = [];

  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    keys.push(key);
    // The value is deliberately absent from this message.
    lines.push(`  - ${key}: ${issue.message}`);
  }

  const report = [
    'Invalid environment configuration. The API will not start.',
    ...lines,
    '',
    'Copy .env.example to .env and fill in the values above.',
  ].join('\n');

  throw new EnvValidationError(keys, report);
}
