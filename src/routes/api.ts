import { Hono } from 'hono';
import type { Env, CreatePostBody, UpdatePostBody, TemplatesBody, SiteConfigBody } from '../types.js';
import { r2Keys } from '../types.js';
import {
  dbGetAllPosts,
  dbGetPostById,
  dbCreatePost,
  dbUpdatePost,
  dbPublishPost,
  dbDeletePost,
  dbSetPostTags,
  dbGetAllTags,
  dbGetSiteConfig,
  dbSetSiteConfig,
  dbPruneOrphanedTags,
} from '../lib/db.js';
import { r2GetText, r2PutText, r2PutBinary, r2Delete, r2ListKeys } from '../lib/r2.js';
import { renderMarkdown } from '../lib/markdown.js';
import { slugify } from '../lib/slugify.js';
import { buildRssFeed } from '../lib/templates.js';

const api = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware — validates ADMIN_SECRET header
// In production replace with Cloudflare Access (no code needed).
// ─────────────────────────────────────────────────────────────────────────────

api.use('*', async (c, next) => {
  const secret = c.env.ADMIN_SECRET;
  // If no secret is configured, allow through (useful for first-time local dev)
  if (!secret) return next();

  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (token !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/posts — list all posts (incl. drafts), admin only, no pagination
// ─────────────────────────────────────────────────────────────────────────────

api.get('/posts', async (c) => {
  const posts = await dbGetAllPosts(c.env.DB, true);
  return c.json(posts);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/posts/:id — single post + markdown content
// ─────────────────────────────────────────────────────────────────────────────

api.get('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  const markdown = await r2GetText(c.env.BUCKET, r2Keys.contentMd(post.slug));
  return c.json({ ...post, markdown: markdown ?? '' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/posts/:id/assets — list previously uploaded assets for a post
// ─────────────────────────────────────────────────────────────────────────────

api.get('/posts/:id/assets', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  const keys = await r2ListKeys(c.env.BUCKET, `assets/${post.slug}/`);
  const assets = keys.map((key) => ({
    key,
    filename: key.split('/').pop() ?? key,
    url: `/assets/${key.replace(/^assets\//, '')}`,
  }));

  return c.json({ assets });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/posts — create post
// ─────────────────────────────────────────────────────────────────────────────

api.post('/posts', async (c) => {
  let body: CreatePostBody;
  try {
    body = await c.req.json<CreatePostBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, author = 'Admin', excerpt, status = 'draft', markdown, tags = [] } = body;
  if (!title?.trim()) return c.json({ error: 'title is required' }, 400);
  if (markdown === undefined) return c.json({ error: 'markdown is required' }, 400);

  // Use caller-provided slug if given (after normalising), otherwise derive from title
  const baseSlug = body.slug?.trim() ? slugify(body.slug.trim()) || slugify(title) : slugify(title);
  if (!baseSlug) return c.json({ error: 'Could not generate slug from title' }, 400);

  // Ensure slug uniqueness by appending timestamp if needed
  let slug = baseSlug;
  const existing = await c.env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).first();
  if (existing) {
    slug = `${baseSlug}-${Date.now()}`;
  }

  // Render markdown → HTML
  const renderedHtml = await renderMarkdown(markdown);

  // Write to R2
  await Promise.all([
    r2PutText(c.env.BUCKET, r2Keys.contentMd(slug), markdown, 'text/markdown; charset=utf-8'),
    r2PutText(c.env.BUCKET, r2Keys.contentHtml(slug), renderedHtml, 'text/html; charset=utf-8'),
  ]);

  // Write to D1
  const id = await dbCreatePost(c.env.DB, { title, slug, author, excerpt, status });
  if (tags.length > 0) await dbSetPostTags(c.env.DB, id, tags);

  // If created directly as published, stamp published_at and regenerate RSS
  if (status === 'published') {
    await dbPublishPost(c.env.DB, id);
    c.executionCtx.waitUntil(invalidateRssCache(c.env));
  }

  const post = await dbGetPostById(c.env.DB, id);
  return c.json(post, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/posts/:id — update post
// ─────────────────────────────────────────────────────────────────────────────

api.put('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  let body: UpdatePostBody;
  try {
    body = await c.req.json<UpdatePostBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { title, author, excerpt, status, markdown, tags } = body;

  // Handle slug rename if title changed
  let newSlug = post.slug;
  if (title && title !== post.title) {
    const candidate = slugify(title);
    const conflict = await c.env.DB
      .prepare('SELECT id FROM posts WHERE slug = ? AND id != ?')
      .bind(candidate, id)
      .first();
    newSlug = conflict ? `${candidate}-${Date.now()}` : candidate;
  }

  // Build D1 field updates (status handled separately via dbPublishPost if publishing)
  const dbUpdates: Record<string, string | undefined> = {};
  if (title)    dbUpdates.title  = title;
  if (author)   dbUpdates.author = author;
  if (excerpt !== undefined) dbUpdates.excerpt = excerpt;
  if (newSlug !== post.slug) dbUpdates.slug = newSlug;

  // Handle status change: publishing uses dbPublishPost to stamp published_at correctly;
  // reverting to draft is a plain field update.
  const isPublishing   = status === 'published' && post.status !== 'published';
  const isUnpublishing = status === 'draft'      && post.status !== 'draft';
  if (isUnpublishing) dbUpdates.status = 'draft';

  if (Object.keys(dbUpdates).length > 0) {
    await dbUpdatePost(c.env.DB, id, dbUpdates);
  }

  if (isPublishing) {
    await dbPublishPost(c.env.DB, id);
  }

  // If title changed → rename R2 keys
  if (newSlug !== post.slug) {
    const [md, html] = await Promise.all([
      r2GetText(c.env.BUCKET, r2Keys.contentMd(post.slug)),
      r2GetText(c.env.BUCKET, r2Keys.contentHtml(post.slug)),
    ]);
    await Promise.all([
      md !== null
        ? r2PutText(c.env.BUCKET, r2Keys.contentMd(newSlug), md, 'text/markdown; charset=utf-8')
        : Promise.resolve(),
      html !== null
        ? r2PutText(c.env.BUCKET, r2Keys.contentHtml(newSlug), html, 'text/html; charset=utf-8')
        : Promise.resolve(),
      r2Delete(c.env.BUCKET, r2Keys.contentMd(post.slug), r2Keys.contentHtml(post.slug)),
    ]);
  }

  // If markdown updated → re-render and store
  if (markdown !== undefined) {
    const renderedHtml = await renderMarkdown(markdown);
    await Promise.all([
      r2PutText(c.env.BUCKET, r2Keys.contentMd(newSlug), markdown, 'text/markdown; charset=utf-8'),
      r2PutText(c.env.BUCKET, r2Keys.contentHtml(newSlug), renderedHtml, 'text/html; charset=utf-8'),
    ]);
  }

  // Update tags if provided; prune orphaned tags fire-and-forget
  if (tags !== undefined) {
    await dbSetPostTags(c.env.DB, id, tags);
    c.executionCtx.waitUntil(dbPruneOrphanedTags(c.env.DB));
  }

  // Invalidate RSS cache if publish state changed or content changed on a published post
  const finalStatus = isPublishing ? 'published' : (isUnpublishing ? 'draft' : post.status);
  if (isPublishing || isUnpublishing || (finalStatus === 'published' && markdown !== undefined)) {
    c.executionCtx.waitUntil(invalidateRssCache(c.env));
  }

  const updated = await dbGetPostById(c.env.DB, id);
  return c.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/posts/:id
// ─────────────────────────────────────────────────────────────────────────────

api.delete('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  // Delete all R2 objects for this post
  const allKeys = await r2ListKeys(c.env.BUCKET, `posts/${post.slug}/`);
  const assetKeys = await r2ListKeys(c.env.BUCKET, `assets/${post.slug}/`);
  const toDelete = [...allKeys, ...assetKeys];

  if (toDelete.length > 0) await r2Delete(c.env.BUCKET, ...toDelete);

  await dbDeletePost(c.env.DB, id);

  // Prune tags and regenerate RSS cache fire-and-forget
  c.executionCtx.waitUntil(
    Promise.all([
      dbPruneOrphanedTags(c.env.DB),
      ...(post.status === 'published' ? [invalidateRssCache(c.env)] : []),
    ]),
  );

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/posts/:id/publish  &  /api/posts/:id/unpublish
// ─────────────────────────────────────────────────────────────────────────────

api.post('/posts/:id/publish', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  await dbPublishPost(c.env.DB, id);
  c.executionCtx.waitUntil(invalidateRssCache(c.env));
  return c.json({ success: true, status: 'published' });
});

api.post('/posts/:id/unpublish', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const post = await dbGetPostById(c.env.DB, id);
  if (!post) return c.json({ error: 'Not found' }, 404);

  await dbUpdatePost(c.env.DB, id, { status: 'draft' });
  c.executionCtx.waitUntil(invalidateRssCache(c.env));
  return c.json({ success: true, status: 'draft' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assets/upload — upload image / file for a post
// ─────────────────────────────────────────────────────────────────────────────

api.post('/assets/upload', async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const slug = (formData.get('slug') as string | null)?.trim();
  if (!slug) return c.json({ error: 'slug field is required' }, 400);

  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'file field is required' }, 400);

  // Sanitise filename
  const safeFilename = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');

  const key = r2Keys.asset(slug, safeFilename);
  const buffer = await file.arrayBuffer();

  await r2PutBinary(c.env.BUCKET, key, buffer, file.type || 'application/octet-stream');

  // Return the public URL (served via GET /assets/...)
  const publicUrl = `/assets/${key.replace(/^assets\//, '')}`;
  return c.json({ url: publicUrl, key });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/templates  &  PUT /api/templates
// ─────────────────────────────────────────────────────────────────────────────

api.get('/templates', async (c) => {
  const [header, footer, aboutMd] = await Promise.all([
    r2GetText(c.env.BUCKET, r2Keys.header()),
    r2GetText(c.env.BUCKET, r2Keys.footer()),
    r2GetText(c.env.BUCKET, r2Keys.aboutMd()),
  ]);
  return c.json({ header: header ?? '', footer: footer ?? '', aboutMd: aboutMd ?? '' });
});

api.put('/templates', async (c) => {
  let body: TemplatesBody;
  try {
    body = await c.req.json<TemplatesBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const ops: Promise<void>[] = [];
  if (body.header !== undefined) {
    ops.push(r2PutText(c.env.BUCKET, r2Keys.header(), body.header, 'text/html; charset=utf-8'));
  }
  if (body.footer !== undefined) {
    ops.push(r2PutText(c.env.BUCKET, r2Keys.footer(), body.footer, 'text/html; charset=utf-8'));
  }
  if (body.aboutMd !== undefined) {
    ops.push(
      r2PutText(c.env.BUCKET, r2Keys.aboutMd(), body.aboutMd, 'text/markdown; charset=utf-8'),
    );
    // Pre-render and cache the HTML
    const html = await renderMarkdown(body.aboutMd);
    ops.push(r2PutText(c.env.BUCKET, r2Keys.aboutHtml(), html, 'text/html; charset=utf-8'));
  }
  await Promise.all(ops);
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tags
// ─────────────────────────────────────────────────────────────────────────────

api.get('/tags', async (c) => {
  const tags = await dbGetAllTags(c.env.DB);
  return c.json(tags);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/site-config  &  PUT /api/site-config
// ─────────────────────────────────────────────────────────────────────────────

api.get('/site-config', async (c) => {
  const config = await dbGetSiteConfig(c.env.DB);
  return c.json(config);
});

api.put('/site-config', async (c) => {
  let body: SiteConfigBody;
  try {
    body = await c.req.json<SiteConfigBody>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  await dbSetSiteConfig(c.env.DB, body);

  // Re-build RSS cache with updated config (new site_url may affect feed URLs)
  c.executionCtx.waitUntil(invalidateRssCache(c.env));

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// RSS cache invalidation helper
// Reads site_url from site_config so the cached feed always has correct absolute
// URLs — no string-patching needed when the cache is served.
// ─────────────────────────────────────────────────────────────────────────────

async function invalidateRssCache(env: Env): Promise<void> {
  try {
    const [posts, siteConfig] = await Promise.all([
      dbGetAllPosts(env.DB, false), // all published, no pagination (RSS needs all)
      dbGetSiteConfig(env.DB),
    ]);

    // Use the stored site_url as the canonical base URL.
    // If not configured yet, fall back to an empty string — the feed will still be
    // valid XML, just with relative-looking links until the user sets site_url.
    const baseUrl = siteConfig.site_url.replace(/\/$/, '');

    // Fetch all rendered HTML bodies for full-content RSS
    const htmlBodies = await Promise.all(
      posts.map((p) => r2GetText(env.BUCKET, r2Keys.contentHtml(p.slug))),
    );

    const contentMap = new Map<string, string>();
    posts.forEach((p, i) => {
      const html = htmlBodies[i];
      if (html) contentMap.set(p.slug, html);
    });

    const xml = buildRssFeed(posts, baseUrl, contentMap, siteConfig);
    await r2PutText(env.BUCKET, r2Keys.rssCache(), xml, 'application/rss+xml; charset=utf-8');
  } catch (err) {
    // Cache invalidation failure is non-fatal — the live /rss route will fall back
    console.error('[RSS cache] invalidation failed:', err);
  }
}

export { api as apiRouter };
export { invalidateRssCache };
