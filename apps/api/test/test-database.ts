/**
 * Connection string for the integration test database.
 *
 * Defaults to the Docker test instance from `docker-compose.yml` (port 5435 —
 * 5432 is a local PostgreSQL install and 5434 belongs to another project's
 * stack). CI overrides it via `TEST_DATABASE_URL`.
 *
 * Note the port: pointing tests at the *development* database on 5433 would let
 * a future truncating test delete real work. The separation is deliberate.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://fitta:fitta_test_password@localhost:5435/fitta_test?schema=public';

/**
 * A connection string pointing at a port with nothing listening.
 *
 * Used to prove readiness reports 503 when PostgreSQL is unreachable
 * (acceptance case 7) without stopping a container mid-suite, which would make
 * the test order-dependent and unrunnable in parallel.
 */
export const UNREACHABLE_DATABASE_URL =
  'postgresql://fitta:fitta@127.0.0.1:59999/fitta_nowhere?schema=public&connect_timeout=1';
