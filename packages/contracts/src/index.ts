/**
 * @fitta/contracts
 *
 * The single source of truth for the FITTA API contract (docs/DECISIONS.md
 * ADR-006). Schemas defined here produce runtime validation on the server and
 * inferred types on the client, so a breaking change fails `pnpm typecheck` in
 * both apps within the same commit.
 */
export * from './common/error';
export * from './health/health';
