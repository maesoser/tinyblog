export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  /** Secret for admin auth (set via: npx wrangler secret put ADMIN_SECRET) */
  ADMIN_SECRET: string;
}

// ── D1 row shapes ──────────────────────────────────────────────────────────

export interface PostRow {
  id: number;
  title: string;
  slug: string;
  author: string;
  excerpt: string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface TagRow {
  id: number;
  name: string;
}

export interface PostWithTags extends PostRow {
  tags: string[];
}

export interface SiteConfig {
  blog_name: string;
  blog_tagline: string;
  /** Full origin of the site, e.g. "https://myblog.com" (no trailing slash). Used for RSS and sitemap URLs. */
  site_url: string;
}

// ── API request bodies ─────────────────────────────────────────────────────

export interface CreatePostBody {
  title: string;
  slug?: string;
  author?: string;
  excerpt?: string;
  status?: 'draft' | 'published';
  markdown: string;
  tags?: string[];
}

export interface UpdatePostBody {
  title?: string;
  author?: string;
  excerpt?: string;
  status?: 'draft' | 'published';
  markdown?: string;
  tags?: string[];
}

export interface TemplatesBody {
  header?: string;
  footer?: string;
  aboutMd?: string;
}

export interface SiteConfigBody {
  blog_name?: string;
  blog_tagline?: string;
  site_url?: string;
}

// ── R2 key helpers ─────────────────────────────────────────────────────────

export const r2Keys = {
  contentMd:   (slug: string) => `posts/${slug}/content.md`,
  contentHtml: (slug: string) => `posts/${slug}/content.html`,
  asset:       (slug: string, filename: string) => `assets/${slug}/${filename}`,
  header:      () => 'templates/header.html',
  footer:      () => 'templates/footer.html',
  aboutMd:     () => 'templates/about.md',
  aboutHtml:   () => 'templates/about.html',
  rssCache:    () => 'cache/rss.xml',
};
