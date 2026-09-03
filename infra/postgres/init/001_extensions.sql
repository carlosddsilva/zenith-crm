-- Zenith CRM standalone PostgreSQL bootstrap.
-- These extensions are already used by the upstream WaCRM schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
