-- tinyblog D1 schema
-- Run with: npm run db:migrate:local  (dev)
--           npm run db:migrate:remote (production)

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  author     TEXT    NOT NULL DEFAULT 'Admin',
  excerpt    TEXT,
  status     TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_slug       ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id  ON post_tags(tag_id);
