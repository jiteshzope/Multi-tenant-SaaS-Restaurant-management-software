-- 0001_extensions
-- MUST run before 0002_init: that migration creates citext columns.

-- gen_random_uuid() is built into PostgreSQL 13+; pgcrypto provides it on 12 and older.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Case-insensitive text — emails, slugs and unique menu names.
CREATE EXTENSION IF NOT EXISTS citext;

-- Trigram indexes — makes  WHERE name ILIKE '%biry%'  fast.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
