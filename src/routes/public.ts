import { Hono } from 'hono';
import type { Env, SiteConfig } from '../types.js';
import { dbGetAllPosts, dbGetPostBySlug, dbGetPostsByTag, dbGetSiteConfig, dbCountPublishedPosts, PAGE_SIZE } from '../lib/db.js';
import { r2GetText, r2PutText } from '../lib/r2.js';
import {
  publicShell,
  renderPostList,
  renderPostPage,
  buildRssFeed,
  escHtml,
} from '../lib/templates.js';
import { r2Keys } from '../types.js';

const pub = new Hono<{ Bindings: Env }>();

// Cache-Control value for all server-rendered public pages
const PAGE_CACHE = 'public, max-age=60, stale-while-revalidate=300';

// ── Helpers ────────────────────────────────────────────────────────────────

interface PageContext {
  header: string;
  footer: string;
  siteConfig: SiteConfig;
}

/**
 * Fetch header/footer templates and site config in parallel.
 * Called at the top of every public route.
 */
async function getPageContext(bucket: R2Bucket, db: D1Database): Promise<PageContext> {
  const [header, footer, siteConfig] = await Promise.all([
    r2GetText(bucket, r2Keys.header()),
    r2GetText(bucket, r2Keys.footer()),
    dbGetSiteConfig(db),
  ]);
  return { header: header ?? '', footer: footer ?? '', siteConfig };
}

// ── GET / — Blog index ─────────────────────────────────────────────────────

pub.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1);

  const [posts, totalCount, ctx] = await Promise.all([
    dbGetAllPosts(c.env.DB, false, page),
    dbCountPublishedPosts(c.env.DB),
    getPageContext(c.env.BUCKET, c.env.DB),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const { header, footer, siteConfig } = ctx;

  const body = renderPostList(posts, undefined, { page, totalPages });
  const html = publicShell({
    title: siteConfig.blog_name,
    blogName: siteConfig.blog_name,
    description: siteConfig.blog_tagline,
    bodyContent: body,
    customHeader: header,
    customFooter: footer,
  });
  return c.html(html, 200, { 'Cache-Control': PAGE_CACHE });
});

// ── GET /tags/:tag — Filtered post list ────────────────────────────────────

pub.get('/tags/:tag', async (c) => {
  const tag = decodeURIComponent(c.req.param('tag'));

  const [posts, ctx] = await Promise.all([
    dbGetPostsByTag(c.env.DB, tag),
    getPageContext(c.env.BUCKET, c.env.DB),
  ]);
  const { header, footer, siteConfig } = ctx;

  const body = renderPostList(posts, tag);
  const html = publicShell({
    title: `Posts tagged "${tag}" — ${siteConfig.blog_name}`,
    blogName: siteConfig.blog_name,
    bodyContent: body,
    customHeader: header,
    customFooter: footer,
  });
  return c.html(html, 200, { 'Cache-Control': PAGE_CACHE });
});

// ── GET /posts/:slug — Single post ────────────────────────────────────────

pub.get('/posts/:slug', async (c) => {
  const slug = c.req.param('slug');
  const baseUrl = new URL(c.req.url).origin;

  const [post, bodyHtml, ctx] = await Promise.all([
    dbGetPostBySlug(c.env.DB, slug, true),
    r2GetText(c.env.BUCKET, r2Keys.contentHtml(slug)),
    getPageContext(c.env.BUCKET, c.env.DB),
  ]);
  const { header, footer, siteConfig } = ctx;

  if (!post || bodyHtml === null) {
    return c.html(
      publicShell({
        title: `Not Found — ${siteConfig.blog_name}`,
        blogName: siteConfig.blog_name,
        bodyContent: '<div class="container"><h1>404 — Post not found</h1><p><a href="/">← Back to all posts</a></p></div>',
        customHeader: header,
        customFooter: footer,
      }),
      404,
    );
  }

  const pageBody = renderPostPage(post, bodyHtml);
  const html = publicShell({
    title: `${post.title} — ${siteConfig.blog_name}`,
    blogName: siteConfig.blog_name,
    description: post.excerpt ?? undefined,
    ogUrl: `${baseUrl}/posts/${encodeURIComponent(post.slug)}`,
    bodyContent: pageBody,
    customHeader: header,
    customFooter: footer,
  });
  return c.html(html, 200, { 'Cache-Control': PAGE_CACHE });
});

// ── GET /about ────────────────────────────────────────────────────────────

pub.get('/about', async (c) => {
  const [bodyHtml, ctx] = await Promise.all([
    r2GetText(c.env.BUCKET, r2Keys.aboutHtml()),
    getPageContext(c.env.BUCKET, c.env.DB),
  ]);
  const { header, footer, siteConfig } = ctx;

  if (!bodyHtml) {
    return c.html(
      publicShell({
        title: `About — ${siteConfig.blog_name}`,
        blogName: siteConfig.blog_name,
        bodyContent: '<div class="container"><h1>About</h1><p>This page hasn\'t been written yet. Check back soon.</p></div>',
        customHeader: header,
        customFooter: footer,
      }),
      200,
    );
  }

  const html = publicShell({
    title: `About — ${siteConfig.blog_name}`,
    blogName: siteConfig.blog_name,
    bodyContent: `<article class="post container"><h1 class="post-title" style="margin-bottom:32px">About</h1><div class="post-body prose">${bodyHtml}</div></article>`,
    customHeader: header,
    customFooter: footer,
  });
  return c.html(html, 200, { 'Cache-Control': PAGE_CACHE });
});

// ── GET /rss — RSS 2.0 feed ────────────────────────────────────────────────

pub.get('/rss', async (c) => {
  // Fast path: serve the pre-built feed from R2 directly.
  // The cache is written by invalidateRssCache using the stored site_url, so
  // no string-patching is needed here — the URLs inside are already correct.
  const cached = await r2GetText(c.env.BUCKET, r2Keys.rssCache());
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Slow path: build on-demand on the first request (before cache exists).
  // Use the request origin as a fallback when site_url is not yet configured.
  const [posts, siteConfig] = await Promise.all([
    dbGetAllPosts(c.env.DB, false),
    dbGetSiteConfig(c.env.DB),
  ]);

  const baseUrl = (siteConfig.site_url || new URL(c.req.url).origin).replace(/\/$/, '');

  const htmlBodies = await Promise.all(
    posts.map((p) => r2GetText(c.env.BUCKET, r2Keys.contentHtml(p.slug))),
  );

  const contentMap = new Map<string, string>();
  posts.forEach((p, i) => {
    const html = htmlBodies[i];
    if (html) contentMap.set(p.slug, html);
  });

  const xml = buildRssFeed(posts, baseUrl, contentMap, siteConfig);

  // Persist to cache fire-and-forget
  c.executionCtx.waitUntil(
    r2PutText(c.env.BUCKET, r2Keys.rssCache(), xml, 'application/rss+xml; charset=utf-8'),
  );

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

// ── GET /sitemap.xml ───────────────────────────────────────────────────────

pub.get('/sitemap.xml', async (c) => {
  const [posts, siteConfig] = await Promise.all([
    dbGetAllPosts(c.env.DB, false), // all published, no pagination
    dbGetSiteConfig(c.env.DB),
  ]);

  // Require site_url to generate meaningful absolute URLs.
  // Fall back to the request origin so the sitemap is still useful even before
  // the user has configured site_url.
  const baseUrl = (siteConfig.site_url || new URL(c.req.url).origin).replace(/\/$/, '');

  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    `  <url>\n    <loc>${escHtml(baseUrl)}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${escHtml(baseUrl)}/about</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`,
  ];

  const postUrls = posts.map((p) => {
    const lastmod = (p.updated_at ?? p.published_at ?? today).slice(0, 10);
    return `  <url>\n    <loc>${escHtml(baseUrl)}/posts/${encodeURIComponent(p.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...postUrls].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=172800', // 2 days
    },
  });
});

// ── GET /assets/:key+ — Proxy R2 assets ───────────────────────────────────

pub.get('/assets/*', async (c) => {
  // strip the leading "/assets/"
  const url = new URL(c.req.url);
  const key = 'assets/' + url.pathname.replace(/^\/assets\//, '');

  const obj = await c.env.BUCKET.get(key);
  if (!obj) {
    return c.text('Not found', 404);
  }

  const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

export { pub as publicRouter };
