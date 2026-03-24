# tinyblog

A minimalist personal blog CMS built on Cloudflare's serverless stack.

## Why

I wanted a simple blog with a clean, minimalistic reading experience and a proper WYSIWYG writing interface — no raw Markdown files committed to a git repo, no complex deployment pipeline, just write and publish.

[WriteFreely](https://writefreely.org/) was the closest thing to what I had in mind, but self-hosting it added more moving parts than I wanted, and customising the look and feel beyond its built-in themes was more involved than I'd like. So I built this instead.

The result is a single Cloudflare Worker that handles everything: the public blog, the admin interface, and the API. No servers to manage, no Docker containers, no databases to babysit. Storage is split between D1 (metadata) and R2 (content), both managed by Cloudflare.

---

## Features

- **WYSIWYG Markdown editor** — [EasyMDE](https://github.com/Ionaru/easy-markdown-editor) with live preview, side-by-side mode, and a full formatting toolbar
- **Syntax highlighting** — server-side via [highlight.js](https://highlightjs.org/), baked into HTML at save time (no client JS needed)
- **Draft / publish workflow** — write privately, publish when ready, unpublish at any time
- **Tags** — many-to-many, case-insensitive, with filtered `/tags/<tag>` listing pages
- **Image and file uploads** — drag-and-drop or click-to-upload, stored in R2 and served with immutable caching; Markdown links auto-inserted at cursor
- **Custom header/footer templates** — raw HTML editable from the admin Settings page, injected into every public page
- **About page** — Markdown-based `/about` route managed from Settings
- **RSS 2.0 feed** — full-content feed at `/rss`, pre-built and cached in R2 on every publish
- **Sitemap** — auto-generated `/sitemap.xml` with all published posts, updated on deploy
- **Open Graph / SEO meta tags** — `og:title`, `og:description`, `og:url`, `<meta name="description">` on every post page
- **Pagination** — 10 posts per page, server-rendered prev/next links
- **Dark mode** — system preference detection plus a manual toggle, persisted per device
- **Mobile-responsive admin** — bottom navigation bar on small screens, icon-only sidebar on tablets
- **No JS required for readers** — the public blog is fully server-rendered HTML

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                     │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  Hono app   │  │  API routes │  │  Public routes │  │
│  │  index.ts   │  │  /api/*     │  │  /, /posts/*   │  │
│  └─────────────┘  └─────────────┘  └────────────────┘  │
└────────────┬───────────────────┬────────────────────────┘
             │                   │
    ┌────────▼──────┐   ┌────────▼──────┐
    │ Cloudflare D1 │   │ Cloudflare R2 │
    │  (metadata)   │   │   (content)   │
    └───────────────┘   └───────────────┘

Static assets (admin UI, CSS) → Cloudflare Assets binding
```

**D1** stores structured metadata: post titles, slugs, authors, excerpts, statuses, timestamps, tags, and site configuration.

**R2** stores all blob content: raw Markdown sources, pre-rendered HTML fragments, uploaded images and files, the header/footer/about templates, and the pre-built RSS cache.

**Cloudflare Assets** serves everything under `public/` (the admin HTML pages and `style.css`) directly from Cloudflare's edge, bypassing the Worker entirely.

---

## Project Structure

```
src/
  index.ts          # Hono app entrypoint — middleware, route mounting, error handler
  types.ts          # Env interface, shared types, R2 key helpers
  lib/
    db.ts           # D1 query helpers (prefixed db*)
    markdown.ts     # marked + highlight.js render wrapper
    r2.ts           # R2 read/write/delete/list helpers (prefixed r2*)
    slugify.ts      # Title → URL slug
    templates.ts    # HTML rendering (public shell, post list, RSS feed, sitemap)
  routes/
    api.ts          # REST API: CRUD posts, asset upload, templates, tags, site config
    public.ts       # Public blog: /, /posts/:slug, /tags/:tag, /about, /rss, /sitemap.xml, /assets/*
migrations/
  0001_schema.sql   # D1 schema (posts, tags, post_tags)
  0002_published_at_site_config.sql  # Adds published_at, site_config table
  0003_site_url.sql                  # Adds site_url to site_config
public/
  style.css         # Shared stylesheet (public blog + admin)
  robots.txt        # Disallows /admin/ from crawlers
  admin/
    index.html      # Post list — filter tabs, publish/unpublish, delete
    editor.html     # Post editor — EasyMDE, asset upload, slug/tag management
    settings.html   # Site settings, header/footer templates, about page editor
wrangler.jsonc.example  # Config template — copy to wrangler.jsonc and fill in your values
tsconfig.json
```

---

## Admin Interface

The admin lives at `/admin/` and communicates with the Worker API using `Authorization: Bearer <ADMIN_SECRET>`. The secret is stored in `localStorage` and prompted on first visit if a `401` is returned.

### Post list — `/admin/index.html`

Overview of all posts (including drafts) with filter tabs for All / Published / Drafts. From here you can open the editor, toggle publish state, or delete a post. Deletion requires confirmation.

### Editor — `/admin/editor.html`

The main writing interface. The slug is auto-generated from the title and can be manually overridden. Tags are comma-separated. Saving as draft and publishing are separate buttons — "Save Draft" never unpublishes a live post.

The asset panel accepts images, video, PDF, and ZIP files via drag-and-drop or file picker. Previously uploaded assets are loaded automatically when editing an existing post. After upload, the Markdown snippet is auto-inserted at the cursor.

### Settings — `/admin/settings.html`

- **Blog Identity** — Blog name, tagline, and site URL (used for RSS and sitemap links)
- **Header / Footer** — raw HTML templates with live preview; "Reset to default" restores the built-in templates
- **About page** — full EasyMDE editor, content served at `/about`

---

## API Reference

All endpoints require `Authorization: Bearer <ADMIN_SECRET>`. If `ADMIN_SECRET` is unset, all requests pass through (local dev).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/posts` | All posts including drafts, with tags |
| `GET` | `/api/posts/:id` | Single post with raw Markdown content |
| `POST` | `/api/posts` | Create post |
| `PUT` | `/api/posts/:id` | Update post (handles slug rename + R2 key migration) |
| `DELETE` | `/api/posts/:id` | Delete post and all associated R2 content |
| `POST` | `/api/posts/:id/publish` | Publish a draft |
| `POST` | `/api/posts/:id/unpublish` | Revert to draft |
| `GET` | `/api/posts/:id/assets` | List uploaded assets for a post |
| `POST` | `/api/assets/upload` | Upload a file (multipart, `slug` + `file` fields) |
| `GET` | `/api/templates` | Get header, footer, and about Markdown |
| `PUT` | `/api/templates` | Save header, footer, and/or about Markdown |
| `GET` | `/api/tags` | All tags |
| `GET` | `/api/site-config` | Get blog name, tagline, and site URL |
| `PUT` | `/api/site-config` | Update blog name, tagline, and/or site URL |

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

cache/rss.xml                  Pre-built RSS feed (regenerated on publish/unpublish/delete)
```

---

## Deploying Your Own Instance

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — installed automatically via `npm install`

### 1. Clone and install

```bash
git clone https://github.com/your-username/tinyblog.git
cd tinyblog
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 3. Create the Cloudflare resources

```bash
# Create the D1 database — note the database_id in the output
npx wrangler d1 create tinyblog-db

# Create the R2 bucket
npx wrangler r2 bucket create tinyblog-content
```

### 4. Configure Wrangler

```bash
cp wrangler.jsonc.example wrangler.jsonc
```

Open `wrangler.jsonc` and fill in:

| Field | Value |
|-------|-------|
| `database_id` | The ID printed by `wrangler d1 create` |
| `name` | Your preferred Worker name (shown in the dashboard) |
| `compatibility_date` | Today's date in `YYYY-MM-DD` format |

`wrangler.jsonc` is in `.gitignore` — it will never be committed.

### 5. Apply the database schema

```bash
npm run db:migrate:remote
```

### 6. Set the admin secret

```bash
npx wrangler secret put ADMIN_SECRET
```

Choose any string — this is the bearer token you'll enter in the admin UI on first visit.

### 7. Deploy

```bash
npm run deploy
```

The Worker URL is printed after deployment (e.g. `https://tinyblog.your-subdomain.workers.dev`). The admin is at `<url>/admin/`.

### 8. Configure site settings

Open the admin at `<url>/admin/`, navigate to **Settings**, and fill in:

- **Blog name** — displayed in the header and RSS feed
- **Tagline** — used as the homepage meta description
- **Site URL** — your full URL (e.g. `https://tinyblog.your-subdomain.workers.dev`). Used for RSS feed links and the sitemap. Update this if you later add a custom domain.

---

## Custom Domain (optional)

To serve the blog from a custom subdomain (e.g. `blog.yourdomain.com`):

### 1. Add a DNS record in the Cloudflare dashboard

Your domain must already be on Cloudflare. Go to **DNS → Add record**:

| Field | Value |
|-------|-------|
| Type | `AAAA` |
| Name | `blog` (or your preferred subdomain) |
| IPv6 address | `100::` |
| Proxy status | **Proxied** (orange cloud) |

### 2. Add a route to `wrangler.jsonc`

Uncomment and fill in the `routes` block at the bottom of your `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "blog.yourdomain.com/*", "zone_name": "yourdomain.com" }
]
```

### 3. Redeploy

```bash
npm run deploy
```

### 4. Update Site URL in Settings

Change the Site URL in **Admin → Settings** to `https://blog.yourdomain.com`.

---

## Development

```bash
npm run dev
```

Starts a local Wrangler dev server at `http://localhost:8787`. By default, `wrangler.jsonc` has `"remote": true` on both D1 and R2 — local dev reads and writes live production data. To use local emulation instead, set `"remote": false` on both bindings and run `npm run db:migrate:local` first.

`ADMIN_SECRET` is not required locally — requests pass through if the variable is unset.

---

## Security

The admin is protected by a bearer token (`ADMIN_SECRET`) checked in the Worker. For stronger protection, layer [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/) in front of `/admin/*` and `/api/*`:

1. Zero Trust dashboard → **Access → Applications → Add → Self-hosted**
2. Application domain: your blog hostname, path `/admin`
3. Add a second entry for path `/api`
4. Policy: allow only your email address

No code changes are needed — Access intercepts requests at the edge before they reach the Worker.

---

## Tech Stack

| | |
|---|---|
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Framework | [Hono](https://hono.dev/) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Object storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| Markdown editor | [EasyMDE](https://github.com/Ionaru/easy-markdown-editor) |
| Markdown rendering | [marked](https://marked.js.org/) |
| Syntax highlighting | [highlight.js](https://highlightjs.org/) |
| Language | TypeScript (strict mode) |
| Bundler | Wrangler / esbuild |
