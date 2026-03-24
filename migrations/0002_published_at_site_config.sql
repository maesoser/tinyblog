-- Migration 0002: add published_at to posts, add site_config table
-- Run with: npm run db:migrate:local  (dev)
--           npm run db:migrate:remote (production)

-- Add published_at column (NULL until first publish)
ALTER TABLE posts ADD COLUMN published_at TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);

-- Site configuration key/value store
CREATE TABLE IF NOT EXISTS site_config (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed defaults (INSERT OR IGNORE so re-running is safe)
INSERT OR IGNORE INTO site_config (key, value) VALUES ('blog_name',    'tinyblog');
INSERT OR IGNORE INTO site_config (key, value) VALUES ('blog_tagline', 'A personal blog');
