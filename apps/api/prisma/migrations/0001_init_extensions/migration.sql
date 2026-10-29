-- Migration 0001: required PostgreSQL extensions.
--
-- These are hand-written rather than generated. Prisma can manage extensions via
-- the `postgresqlExtensions` preview feature, but a preview flag is a dependency
-- on unstable behaviour for something this simple and this important.
--
-- Why this exists before any table:
--
--   pg_trgm  — trigram similarity + GIN indexing. ADR-012 builds Egyptian Arabic
--              food search on it. Without this extension, Phase 04 cannot work.
--   unaccent — strips Latin diacritics so transliterated names ("Koshári") match
--              their plain forms ("koshari").
--
-- Putting them in the first migration means an environment that lacks them fails
-- here, loudly, in CI — instead of three phases later inside a search bug where
-- the symptom is "some foods just don't come up".

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
