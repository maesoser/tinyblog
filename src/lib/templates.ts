import type { PostWithTags, SiteConfig } from '../types.js';

// ── Social link SVG icons ──────────────────────────────────────────────────

const SOCIAL_ICONS: Record<string, string> = {
  rss: /* html */ `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>`,
  linkedin: /* html */ `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>`,
  github: /* html */ `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>`,
  bluesky: /* html */ `<svg width="18" height="18" viewBox="0 0 600 530" fill="currentColor" aria-hidden="true"><path d="M135.72 44.03C202.216 93.951 273.74 195.17 300 249.49c26.262-54.316 97.782-155.54 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.708-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.45-163.25-81.433C20.15 217.613 10 86.535 10 68.825c0-88.687 77.742-60.816 125.72-24.795z"/></svg>`,
  x: /* html */ `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`,
};

const SOCIAL_LABELS: Record<string, string> = {
  rss: 'RSS',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  bluesky: 'Bluesky',
  x: 'X',
};

// ── Public blog shell ──────────────────────────────────────────────────────

/**
 * Wraps rendered post HTML (or any body content) inside the full page shell,
 * injecting the custom header/footer templates stored in R2.
 * @param opts.title         HTML page title (full string, e.g. "Post title — My Blog")
 * @param opts.blogName      Blog name used in RSS alternate link title
 * @param opts.description   Optional meta description (used for <meta name="description"> and OG)
 * @param opts.ogUrl         Optional canonical URL for Open Graph og:url
 * @param opts.bodyContent   Pre-rendered HTML body content
 * @param opts.customHeader  Custom header HTML from R2 (empty string → use default)
 * @param opts.customFooter  Custom footer HTML from R2 (empty string → use default)
 */
export function publicShell(opts: {
  title: string;
  blogName: string;
  description?: string;
  ogUrl?: string;
  bodyContent: string;
  customHeader: string;
  customFooter: string;
}): string {
  const { title, blogName, description, ogUrl, bodyContent, customHeader, customFooter } = opts;

  const metaDescription = description
    ? `\n  <meta name="description" content="${escHtml(description)}" />`
    : '';
  const ogTags = description || ogUrl
    ? `\n  <meta property="og:type" content="article" />${
        ogUrl ? `\n  <meta property="og:url" content="${escHtml(ogUrl)}" />` : ''
      }\n  <meta property="og:title" content="${escHtml(title)}" />${
        description ? `\n  <meta property="og:description" content="${escHtml(description)}" />` : ''
      }`
    : '';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>${metaDescription}${ogTags}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <link rel="alternate" type="application/rss+xml" title="${escHtml(blogName)} RSS Feed" href="/rss" />
  <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
  <link rel="stylesheet" href="/style.css" />
  <script>
    // Dark mode: apply before paint to avoid flash
    (function(){
      const stored = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (stored === 'dark' || (!stored && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
    })();
  </script>
</head>
<body>
  <div class="site-wrapper">
    <header class="site-header">
      ${customHeader || defaultHeader(blogName)}
    </header>
    <main class="site-main">
      ${bodyContent}
    </main>
    <footer class="site-footer">
      ${customFooter || defaultFooter()}
    </footer>
  </div>
  ${themeToggleScript()}
</body>
</html>`;
}

// ── Default header / footer (fallback when R2 templates are empty) ─────────

/**
 * @param blogName Blog name shown as the site logo text
 */
export function defaultHeader(blogName: string): string {
  return /* html */ `
    <div class="header-inner container">
      <a href="/" class="site-logo">${escHtml(blogName)}</a>
      <nav class="header-nav">
        <a href="/posts" class="header-nav-link">Posts</a>
        <a href="/about" class="header-nav-link">About</a>
        <a href="/admin/" class="header-nav-admin">Admin</a>
      </nav>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" title="Toggle dark mode">
        <svg class="icon-sun" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
        <svg class="icon-moon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      </button>
    </div>`;
}

export function defaultFooter(): string {
  return /* html */ `
    <div class="footer-inner container">
      <p>Powered by <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">Cloudflare Workers</a></p>
      <a href="/rss" class="rss-link" title="RSS Feed">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
        </svg>
        RSS
      </a>
    </div>`;
}

// ── Post list (public index) ───────────────────────────────────────────────

/**
 * @param posts      Posts to display (already paginated)
 * @param filterTag  If set, renders a "Posts tagged X" heading
 * @param pagination If set, renders prev/next page links
 */
export function renderPostList(
  posts: PostWithTags[],
  filterTag?: string,
  pagination?: { page: number; totalPages: number },
): string {
  const heading = filterTag
    ? `Posts tagged <em>${escHtml(filterTag)}</em>`
    : 'All Posts';

  if (posts.length === 0) {
    return /* html */ `
      <section class="post-list-header container">
        <h1>${heading}</h1>
      </section>
      <section class="post-list container">
        <p class="empty-state">No posts yet. Check back soon!</p>
      </section>`;
  }

  const items = posts
    .map(
      (p) => /* html */ `
      <article class="post-card">
        <div class="post-card-meta">
          <time datetime="${p.published_at ?? p.created_at}">${formatDate(p.published_at ?? p.created_at)}</time>
          <span class="sep">·</span>
          <span>${escHtml(p.author)}</span>
          ${p.tags.length ? `<span class="sep">·</span>${p.tags.map((t) => `<a href="/tags/${encodeURIComponent(t)}" class="tag">${escHtml(t)}</a>`).join('')}` : ''}
        </div>
        <h2 class="post-card-title">
          <a href="/posts/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>
        </h2>
        ${p.excerpt ? `<p class="post-card-excerpt">${escHtml(p.excerpt)}</p>` : ''}
      </article>`,
    )
    .join('\n');

  const paginationHtml = pagination && pagination.totalPages > 1
    ? /* html */ `
      <nav class="pagination container" aria-label="Page navigation">
        ${pagination.page > 1
          ? `<a href="?page=${pagination.page - 1}" class="pagination-link">&larr; Newer</a>`
          : '<span class="pagination-link pagination-link--disabled">&larr; Newer</span>'}
        <span class="pagination-info">Page ${pagination.page} of ${pagination.totalPages}</span>
        ${pagination.page < pagination.totalPages
          ? `<a href="?page=${pagination.page + 1}" class="pagination-link">Older &rarr;</a>`
          : '<span class="pagination-link pagination-link--disabled">Older &rarr;</span>'}
      </nav>`
    : '';

  return /* html */ `
    <section class="post-list-header container">
      <h1>${heading}</h1>
    </section>
    <section class="post-list container">
      ${items}
    </section>${paginationHtml}`;
}

// ── Homepage (landing page) ────────────────────────────────────────────────

/**
 * Renders the redesigned landing page: hero (name + tagline + social links),
 * about section (pre-rendered HTML from R2), and the last 3 published posts.
 * @param siteConfig  Site configuration including social link URLs
 * @param aboutHtml   Pre-rendered HTML from templates/about.html (empty string → omit section)
 * @param recentPosts Up to 3 most-recent published posts
 */
export function renderHomepage(
  siteConfig: SiteConfig,
  aboutHtml: string,
  recentPosts: PostWithTags[],
): string {
  // ── Social links row ──────────────────────────────────────────────────────
  const socialEntries: Array<{ key: string; href: string }> = [
    { key: 'rss',      href: siteConfig.social_rss      || '/rss' },
    { key: 'linkedin', href: siteConfig.social_linkedin },
    { key: 'github',   href: siteConfig.social_github },
    { key: 'bluesky',  href: siteConfig.social_bluesky },
    { key: 'x',        href: siteConfig.social_x },
  ];

  // RSS always shows (falls back to /rss); others only show if configured
  const socialLinks = socialEntries
    .filter((e) => e.key === 'rss' || e.href)
    .map(
      (e) => /* html */ `
      <a href="${escHtml(e.href)}" class="home-social-link"${e.key !== 'rss' ? ' target="_blank" rel="noopener noreferrer"' : ''} aria-label="${SOCIAL_LABELS[e.key]}">
        ${SOCIAL_ICONS[e.key]}
        <span>${SOCIAL_LABELS[e.key]}</span>
      </a>`,
    )
    .join('');

  // ── About section ─────────────────────────────────────────────────────────
  const aboutSection = aboutHtml
    ? /* html */ `
    <section class="home-about">
      <div class="home-about-content prose">
        ${aboutHtml}
      </div>
    </section>`
    : '';

  // ── Recent posts ──────────────────────────────────────────────────────────
  const postItems = recentPosts
    .map(
      (p) => /* html */ `
      <div class="home-post-row">
        <time class="home-post-date" datetime="${p.published_at ?? p.created_at}">${formatDateShort(p.published_at ?? p.created_at)}</time>
        <h2 class="home-post-title">
          <a href="/posts/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>
        </h2>
      </div>`,
    )
    .join('\n');

  const postsSection = /* html */ `
    <section class="home-posts">
      <h2 class="home-posts-heading">Occasional blog posts</h2>
      <div class="home-post-list">
        ${postItems || '<p class="empty-state">No posts yet. Check back soon!</p>'}
      </div>
      <a href="/posts" class="home-view-all">View all posts &rarr;</a>
    </section>`;

  return /* html */ `
    <div class="home-hero">
      <h1 class="home-blog-name">${escHtml(siteConfig.blog_name)}</h1>
      <p class="home-tagline">${escHtml(siteConfig.blog_tagline)}</p>
      <nav class="home-social-links" aria-label="Social links">
        ${socialLinks}
      </nav>
    </div>
    ${aboutSection}
    ${postsSection}`;
}

// ── Single post ────────────────────────────────────────────────────────────

export function renderPostPage(post: PostWithTags, bodyHtml: string): string {
  const displayDate = post.published_at ?? post.created_at;
  const mins = readingTime(bodyHtml);
  return /* html */ `
    <article class="post container">
      <header class="post-header">
        <div class="post-header-meta">
          <time datetime="${displayDate}">${formatDate(displayDate)}</time>
          <span class="sep">·</span>
          <span>${escHtml(post.author)}</span>
          <span class="sep">·</span>
          <span>${mins} min read</span>
          ${post.tags.length ? `<span class="sep">·</span>${post.tags.map((t) => `<a href="/tags/${encodeURIComponent(t)}" class="tag">${escHtml(t)}</a>`).join('')}` : ''}
        </div>
        <h1 class="post-title">${escHtml(post.title)}</h1>
      </header>
      <div class="post-body prose">
        ${bodyHtml}
      </div>
      <footer class="post-footer">
        <a href="/">&larr; Back to all posts</a>
      </footer>
    </article>`;
}

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Estimate reading time in minutes from rendered HTML.
 * Strips tags, splits on whitespace, and divides by 200 wpm.
 * Always returns at least 1.
 */
function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function themeToggleScript(): string {
  return /* html */ `<script>
    (function(){
      const btn = document.getElementById('themeToggle');
      if (!btn) return;
      btn.addEventListener('click', function(){
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      });
    })();
  </script>`;
}

export function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Short date for home page post rows: "Aug 2026" */
function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

// ── RSS feed builder ───────────────────────────────────────────────────────

/**
 * Build a valid RSS 2.0 XML feed from a list of published posts.
 * @param posts      Published posts, most-recent first.
 * @param baseUrl    Full origin, e.g. "https://myblog.example.com" (no trailing slash).
 * @param contentMap Map of slug → pre-rendered HTML body to include as full post content.
 * @param siteConfig Blog name and tagline for the feed channel metadata.
 */
export function buildRssFeed(
  posts: PostWithTags[],
  baseUrl: string,
  contentMap: Map<string, string> = new Map(),
  siteConfig: Pick<SiteConfig, 'blog_name' | 'blog_tagline'> = {
    blog_name: 'tinyblog',
    blog_tagline: 'A personal blog',
  },
): string {
  const escXml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const toRfc822 = (iso: string) => {
    try { return new Date(iso).toUTCString(); }
    catch { return iso; }
  };

  const items = posts
    .map((p) => {
      const link = `${baseUrl}/posts/${encodeURIComponent(p.slug)}`;
      const pubDate = p.published_at ?? p.created_at;

      const categories = p.tags
        .map((t) => `    <category>${escXml(t)}</category>`)
        .join('\n');

      // Plain-text description: excerpt if available, otherwise strip HTML from content
      const fullHtml = contentMap.get(p.slug) ?? '';
      const description = p.excerpt
        ? escXml(p.excerpt)
        : escXml(fullHtml.replace(/<[^>]+>/g, '').slice(0, 280).trimEnd() + (fullHtml.length > 280 ? '…' : ''));

      // Full HTML content wrapped in CDATA so it doesn't need entity-escaping
      const contentEncoded = fullHtml
        ? `\n    <content:encoded><![CDATA[${fullHtml}]]></content:encoded>`
        : '';

      return `  <item>
    <title>${escXml(p.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${toRfc822(pubDate)}</pubDate>
    <author>${escXml(p.author)}</author>
    <description>${description}</description>${contentEncoded}
${categories.length ? categories + '\n' : ''}  </item>`;
    })
    .join('\n');

  const lastPubDate = posts.length > 0
    ? toRfc822(posts[0].published_at ?? posts[0].created_at)
    : toRfc822(new Date().toISOString());

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escXml(siteConfig.blog_name)}</title>
    <link>${baseUrl}/</link>
    <description>${escXml(siteConfig.blog_tagline)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastPubDate}</lastBuildDate>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
