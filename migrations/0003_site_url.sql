-- Migration 0003: add site_url to site_config
-- Run with: npm run db:migrate:local  (dev)
--           npm run db:migrate:remote (production)

-- Empty string default — configure in Admin → Settings → Site URL
INSERT OR IGNORE INTO site_config (key, value) VALUES ('site_url', '');
