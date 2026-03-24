# AGENTS.md — tinyblog

Coding agent instructions for the **tinyblog** repository.
tinyblog is a personal blog CMS running on Cloudflare Workers with Hono, D1 (SQLite), and R2.

---

## Project Overview

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (Wrangler 4, ES2022 modules) |
| Framework | [Hono](https://hono.dev/) |
| Database | Cloudflare D1 (SQLite) — post metadata, tags, site config |
| Object storage | Cloudflare R2 — markdown/HTML content, uploaded assets, RSS cache |
| Language | TypeScript (strict mode, `noEmit`, bundled by Wrangler/esbuild) |
| Frontend | Vanilla HTML/CSS/JS in `public/` (no bundler) |

---

## Build / Dev / Deploy Commands

```bash
# Start local dev server (http://localhost:8787)
npm run dev

# Type-check only (no output emitted)
npm run typecheck

# Deploy to Cloudflare production
npm run deploy

# Apply ALL DB migrations to the local emulated D1 instance
npm run db:migrate:local

# Apply ALL DB migrations to the remote (production) D1 instance
npm run db:migrate:remote
```

---

## Lint / Format / Test

**There is no linter, formatter, or test framework configured.**
The only automated quality gate is TypeScript strict-mode type-checking:

```bash
npm run typecheck
```

Run this before every commit to catch type errors. There are no test files or test scripts; the project has no testing infrastructure.

If you add tests, use **Vitest** with `@cloudflare/vitest-pool-workers` (the standard for Cloudflare Workers projects). Add a `test` script to `package.json` and place test files alongside source files as `*.test.ts`.

---

## Repository Layout

```
src/
  index.ts          # Hono app entrypoint — middleware, route mounting, error handler
  types.ts          # Env interface, shared types, R2 key helpers
  lib/
    db.ts           # D1 query helpers (prefixed db*)
    markdown.ts     # marked render wrapper
    r2.ts           # R2 read/write/delete/list helpers (prefixed r2*)
    slugify.ts      # Title → URL slug
    templates.ts    # HTML rendering (shell, post list, RSS feed)
  routes/
    api.ts          # REST API (CRUD posts, upload, templates, tags, site-config)
    public.ts       # Public blog routes (/, /posts/:slug, /about, /rss, /assets/*)
migrations/
  0001_schema.sql   # D1 schema — posts, tags, post_tags tables
  0002_published_at_site_config.sql  # Adds published_at to posts; adds site_config table
public/             # Static assets (style.css, admin HTML pages, robots.txt)
wrangler.jsonc      # Wrangler config (bindings: ASSETS, DB, BUCKET)
tsconfig.json       # TypeScript config
```

---

## D1 Schema Overview

### `posts`
| Column | Notes |
|---|---|
| `id` | PK autoincrement |
| `title`, `slug` (UNIQUE), `author`, `excerpt` | Post metadata |
| `status` | `'draft'` \| `'published'` |
| `created_at` | Row insertion time (draft creation) |
| `published_at` | Set on **first** publish only; `NULL` until published |
| `updated_at` | Updated on every write |

### `tags` / `post_tags`
Many-to-many join. Tags are case-insensitive (`COLLATE NOCASE`).

### `site_config`
Key/value table (`key TEXT PRIMARY KEY, value TEXT`). Current keys:
- `blog_name` — displayed in the header, page titles, and RSS feed
- `blog_tagline` — used as the homepage meta description and RSS channel description
- `site_url` — canonical origin (e.g. `https://myblog.com`); used for RSS `<link>`/`<guid>` and `sitemap.xml` URLs; no trailing slash

---

## R2 Object Layout

```
posts/<slug>/content.md        Raw Markdown source
posts/<slug>/content.html      Pre-rendered HTML (written at save time)

assets/<slug>/<filename>       Uploaded images and files

templates/header.html          Custom site header HTML
templates/footer.html          Custom site footer HTML
templates/about.md             About page Markdown source
templates/about.html           About page pre-rendered HTML

cache/rss.xml                  Pre-built RSS feed (invalidated on publish/unpublish/delete/site-config change)
```

---

## Code Style Guidelines

### TypeScript

- `"strict": true` is enforced — no implicit `any`, strict null checks, etc.
- All exported functions must have explicit return types.
- Use `import type { ... }` for type-only imports.
- Use union literal types for constrained values: `'draft' | 'published'`.
- Use `Partial<{ ... }>` for partial update payloads.
- Prefer `Promise.all([...])` for independent parallel async operations.
- Generic typed D1 queries: `.first<PostRow>()`, `.all<PostRow>()`.

### Imports

- Always use the `.js` extension on local imports (required by `"moduleResolution": "bundler"`):
  ```ts
  import { dbGetAllPosts } from '../lib/db.js';
  import type { Env } from './types.js';
  ```
- Named imports only from local modules; no default imports except `app` from `index.ts`.
- Group imports: external packages first, then local modules.

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Files | `camelCase.ts` | `slugify.ts`, `templates.ts` |
| Functions | `camelCase` | `dbGetAllPosts`, `r2PutBinary` |
| DB helper prefix | `db*` | `dbGetPostById`, `dbPublishPost` |
| R2 helper prefix | `r2*` | `r2GetText`, `r2PutBinary` |
| Template/render | `render*` / `build*` | `renderPostPage`, `buildRssFeed` |
| Interfaces/types | `PascalCase` | `PostRow`, `PostWithTags`, `SiteConfig` |
| Hono router instances | role-named | `api`, `pub` (re-exported as `apiRouter`, `publicRouter`) |

### Error Handling

Use guard-clause early returns with appropriate HTTP status codes. Never use nested `if` trees for validation.

```ts
// Parse and validate request body
let body: CreatePostBody;
try {
  body = await c.req.json<CreatePostBody>();
} catch {
  return c.json({ error: 'Invalid JSON body' }, 400);
}

// Guard-clause pattern for missing/invalid params
const id = Number(c.req.param('id'));
if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

const post = await dbGetPostById(c.env.DB, id);
if (!post) return c.json({ error: 'Not found' }, 404);
```

Top-level error handler in `index.ts` logs to `console.error` and returns `500`. Do not swallow errors silently; always log before returning an error response.

Use null-coalescing for optional values: `data.excerpt ?? null`, `header ?? ''`.

### Formatting & Comments

- Use `// ── Section Name ──────────────────────────────────────────────────────────` dash separators as visual section headers within longer files.
- Use JSDoc comments with `@param` tags on all exported functions.
- Tag template literal HTML strings with `/* html */` for IDE syntax highlighting:
  ```ts
  return /* html */ `<!DOCTYPE html>...`;
  ```
- No semicolons rule or quote style is enforced by tooling — follow the existing file's style.

---

## Cloudflare Workers Specifics

- Access bindings via `c.env` in Hono handlers: `c.env.DB`, `c.env.BUCKET`, `c.env.ASSETS`.
- The `Env` interface in `src/types.ts` declares all bindings — add new bindings there first, then update `wrangler.jsonc`.
- Use `@cloudflare/workers-types` for all Workers-specific globals (`D1Database`, `R2Bucket`, `ExecutionContext`, etc.).
- D1 queries must be awaited; use `.first<T>()` for single rows, `.all<T>()` for result sets, `.run()` for mutations.
- R2 reads return `R2ObjectBody | null` — always null-check before calling `.text()` / `.arrayBuffer()`.
- Do not use Node.js built-ins unless covered by the `nodejs_compat_v2` compatibility flag.
- Use `c.executionCtx.waitUntil(promise)` for fire-and-forget work after the response is sent (e.g. writing the RSS cache).

---

## Key Behaviours to Preserve

- **`published_at` is write-once**: `dbPublishPost` uses `COALESCE(published_at, CURRENT_TIMESTAMP)` so the first-publish date is never overwritten. Never set `published_at` directly from user input.
- **RSS cache**: call `invalidateRssCache(env)` (exported from `api.ts`) after any publish, unpublish, or delete. The `/rss` route reads `cache/rss.xml` from R2 first and falls back to on-demand generation. The cache is also regenerated when `PUT /api/site-config` is called, since changing `site_url` affects all feed links. The cached XML contains fully-qualified URLs (uses `site_url` from `site_config`) — no string-patching on serve.
- **Public sort order**: published posts are ordered by `COALESCE(published_at, created_at) DESC`. Admin lists use `updated_at DESC`.
- **Duplicate-tag fix**: `dbGetPostsByTag` uses a `WHERE EXISTS` subquery (not a join) to filter by tag, avoiding `GROUP_CONCAT` duplicates.
- **Orphaned tag cleanup**: `dbPruneOrphanedTags` deletes tags with no remaining `post_tags` associations. Called via `waitUntil` after tag updates and post deletes — fire-and-forget, non-blocking.
- **Save Draft safety**: the editor's "Save Draft" button does NOT send `status` in the PUT body when editing an existing post. Only "Publish" sends `status: 'published'`. This prevents accidentally unpublishing live posts.
- **Slug on create**: the API accepts an optional `slug` field in `CreatePostBody`. If provided (and non-empty), it is slugified and used as the base slug instead of deriving from the title.
- **Pagination**: the public index uses `PAGE_SIZE = 10` (exported from `db.ts`). `dbGetAllPosts(db, false, page)` handles paging. The admin API always fetches all posts (`includeAll = true`).
- **Sitemap**: `GET /sitemap.xml` generates a sitemap for homepage, `/about`, and all published posts. Uses `site_url` from config; falls back to request origin. 2-day `Cache-Control`.

---

## Adding New Features — Checklist

1. Add any new shared types to `src/types.ts`.
2. Add D1 query helpers to `src/lib/db.ts` with the `db*` prefix.
3. Add R2 helpers to `src/lib/r2.ts` with the `r2*` prefix.
4. Register routes in the appropriate router (`src/routes/api.ts` or `src/routes/public.ts`).
5. If a new binding is needed, declare it in `Env` (`src/types.ts`) and `wrangler.jsonc`.
6. If adding a new D1 schema change, create `migrations/000N_description.sql` and update both `db:migrate` scripts in `package.json`.
7. Run `npm run typecheck` and confirm zero errors before committing.
