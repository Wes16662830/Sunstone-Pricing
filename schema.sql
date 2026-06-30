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
