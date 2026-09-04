-- Cloudflare D1 schema for the Sunstone Pricing Calculator quote store.
-- Apply locally:  npx wrangler d1 execute sunstone-quotes --local  --file=schema.sql
-- Apply remote:   npx wrangler d1 execute sunstone-quotes --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  customer    TEXT,
  deal_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Global pricing configuration (single shared row, id = 1). When absent, the
-- app falls back to the built-in workbook defaults.
CREATE TABLE IF NOT EXISTS config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  data_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Per-client magic access links (/client-access?token=...). The token itself is
-- the credential — visiting a valid, unrevoked link signs the browser in as a
-- client with no separate password. Created/revoked from Config → Client Access
-- Links by internal staff.
CREATE TABLE IF NOT EXISTS client_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT NOT NULL UNIQUE,
  label       TEXT,
  created_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0
);
