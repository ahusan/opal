-- D1 schema for the Resort Survey data store.
-- Run once against your D1 database (see README).

CREATE TABLE IF NOT EXISTS resorts (
  id         TEXT PRIMARY KEY,   -- resort id (e.g. r1718...)
  name       TEXT,               -- resort name, for cheap listing/search
  doc        TEXT NOT NULL,      -- full resort object as JSON
  updated_at TEXT,               -- ISO timestamp of last write
  updated_by TEXT                -- email from Cloudflare Access (or 'local' in dev)
);

CREATE TABLE IF NOT EXISTS app_config (
  id  TEXT PRIMARY KEY,          -- always 'global'
  doc TEXT NOT NULL              -- { customSections, sectionOrder, hiddenSections } as JSON
);
