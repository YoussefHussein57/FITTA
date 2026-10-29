/**
 * Standalone configuration check.
 *
 * Exists so that "startup fails clearly when required configuration is missing"
 * (Phase 01 acceptance case 6) is verifiable on its own, without starting an
 * HTTP server and reading through unrelated boot noise. CI runs it before the
 * app, so a misconfigured environment fails in one second with one message.
 *
 * Exit codes: 0 valid, 1 invalid.
 */
import { EnvValidationError, loadEnv } from './env';

function main(): void {
  try {
    const env = loadEnv();
    // Keys only. Values may contain credentials (docs/SECURITY.md §6).
    const keys = Object.keys(env).sort().join(', ');
    console.error(`Environment OK (NODE_ENV=${env.NODE_ENV}). Resolved keys: ${keys}`);
    process.exit(0);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main();
