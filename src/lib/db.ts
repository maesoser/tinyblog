import type { PostRow, PostWithTags, TagRow, SiteConfig } from '../types.js';

// ── Posts ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

/**
 * Fetch posts. Admin mode returns all (drafts + published), ordered by updated_at.
 * Public mode returns only published posts, ordered by published_at DESC, paginated.
 * @param db          D1 database binding
 * @param includeAll  When true (admin), include drafts and skip pagination
 * @param page        1-indexed page number (used only when includeAll=false)
 */
export async function dbGetAllPosts(
  db: D1Database,
  includeAll = false,
  page = 1,
): Promise<PostWithTags[]> {
  if (includeAll) {
    // Admin: all posts, no pagination, ordered by last edit
    const { results } = await db
      .prepare(
        `SELECT p.*, GROUP_CONCAT(t.name) AS tag_names
         FROM posts p
         LEFT JOIN post_tags pt ON pt.post_id = p.id
         LEFT JOIN tags t ON t.id = pt.tag_id
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
      )
      .all<PostRow & { tag_names: string | null }>();
    return results.map(normalisePost);
  }

  // Public: published only, ordered by publish date, paginated
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const { results } = await db
    .prepare(
      `SELECT p.*, GROUP_CONCAT(t.name) AS tag_names
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.status = 'published'
       GROUP BY p.id
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(PAGE_SIZE, offset)
    .all<PostRow & { tag_names: string | null }>();

  return results.map(normalisePost);
}

/**
 * Count published posts (for pagination).
 * @param db D1 database binding
 */
export async function dbCountPublishedPosts(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS total FROM posts WHERE status = 'published'`)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/**
 * Fetch published posts filtered by tag, ordered by publish date.
 * Uses WHERE EXISTS to avoid the double-join GROUP_CONCAT duplicate bug.
 */
export async function dbGetPostsByTag(db: D1Database, tagName: string): Promise<PostWithTags[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, GROUP_CONCAT(t.name) AS tag_names
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.status = 'published'
         AND EXISTS (
           SELECT 1 FROM post_tags pt2
           JOIN tags tf ON tf.id = pt2.tag_id
           WHERE pt2.post_id = p.id AND LOWER(tf.name) = LOWER(?)
         )
       GROUP BY p.id
       ORDER BY COALESCE(p.published_at, p.created_at) DESC`,
    )
    .bind(tagName)
    .all<PostRow & { tag_names: string | null }>();

  return results.map(normalisePost);
}

export async function dbGetPostById(db: D1Database, id: number): Promise<PostWithTags | null> {
  const row = await db
    .prepare(
      `SELECT p.*, GROUP_CONCAT(t.name) AS tag_names
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.id = ?
       GROUP BY p.id`,
    )
    .bind(id)
    .first<PostRow & { tag_names: string | null }>();

  return row ? normalisePost(row) : null;
}

export async function dbGetPostBySlug(
  db: D1Database,
  slug: string,
  publishedOnly = true,
): Promise<PostWithTags | null> {
  const statusClause = publishedOnly ? "AND p.status = 'published'" : '';
  const row = await db
    .prepare(
      `SELECT p.*, GROUP_CONCAT(t.name) AS tag_names
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.slug = ? ${statusClause}
       GROUP BY p.id`,
    )
    .bind(slug)
    .first<PostRow & { tag_names: string | null }>();

  return row ? normalisePost(row) : null;
}

export async function dbCreatePost(
  db: D1Database,
  data: { title: string; slug: string; author: string; excerpt?: string; status: string },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO posts (title, slug, author, excerpt, status)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(data.title, data.slug, data.author, data.excerpt ?? null, data.status)
    .run();

  return result.meta.last_row_id as number;
}

export async function dbUpdatePost(
  db: D1Database,
  id: number,
  data: Partial<{ title: string; slug: string; author: string; excerpt: string; status: string }>,
): Promise<void> {
  const fields = Object.keys(data) as Array<keyof typeof data>;
  if (fields.length === 0) return;

  const setClauses = [...fields.map((f) => `${f} = ?`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
  const values = [...fields.map((f) => data[f] ?? null), id];

  await db.prepare(`UPDATE posts SET ${setClauses} WHERE id = ?`).bind(...values).run();
}

/**
 * Publish a post: set status to 'published' and stamp published_at on first publish only.
 * @param db D1 database binding
 * @param id Post ID
 */
export async function dbPublishPost(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(
      `UPDATE posts
       SET status = 'published',
           published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function dbDeletePost(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function dbGetAllTags(db: D1Database): Promise<TagRow[]> {
  const { results } = await db.prepare('SELECT * FROM tags ORDER BY name').all<TagRow>();
  return results;
}

/**
 * Upsert a list of tag names and associate them with a post.
 * Replaces any existing tag associations for that post.
 */
export async function dbSetPostTags(db: D1Database, postId: number, tagNames: string[]): Promise<void> {
  // Remove existing associations
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').bind(postId),
  ];

  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    // Upsert tag
    stmts.push(db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').bind(trimmed));
  }

  await db.batch(stmts);

  // Now insert associations (need tag IDs, so do separately)
  if (tagNames.length > 0) {
    const assocStmts: D1PreparedStatement[] = [];
    for (const name of tagNames) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      assocStmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO post_tags (post_id, tag_id)
             SELECT ?, id FROM tags WHERE LOWER(name) = LOWER(?)`,
          )
          .bind(postId, trimmed),
      );
    }
    if (assocStmts.length > 0) await db.batch(assocStmts);
  }
}

/**
 * Delete tags that are no longer associated with any post.
 * Safe to call after any tag update or post deletion.
 */
export async function dbPruneOrphanedTags(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)')
    .run();
}

// ── Site config ────────────────────────────────────────────────────────────

/**
 * Fetch all site configuration as a typed object.
 * Falls back to defaults if rows are missing.
 */
export async function dbGetSiteConfig(db: D1Database): Promise<SiteConfig> {
  const { results } = await db
    .prepare('SELECT key, value FROM site_config WHERE key IN (?, ?, ?)')
    .bind('blog_name', 'blog_tagline', 'site_url')
    .all<{ key: string; value: string }>();

  const map = new Map(results.map((r) => [r.key, r.value]));
  return {
    blog_name:    map.get('blog_name')    ?? 'tinyblog',
    blog_tagline: map.get('blog_tagline') ?? 'A personal blog',
    site_url:     map.get('site_url')     ?? '',
  };
}

/**
 * Upsert one or more site config keys.
 * @param db      D1 database binding
 * @param updates Partial site config (only provided keys are written)
 */
export async function dbSetSiteConfig(
  db: D1Database,
  updates: Partial<SiteConfig>,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      stmts.push(
        db
          .prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)')
          .bind(key, value),
      );
    }
  }
  if (stmts.length > 0) await db.batch(stmts);
}

// ── Internal helpers ───────────────────────────────────────────────────────

function normalisePost(row: PostRow & { tag_names: string | null }): PostWithTags {
  const { tag_names, ...rest } = row;
  return {
    ...rest,
    tags: tag_names ? tag_names.split(',').map((t) => t.trim()).filter(Boolean) : [],
  };
}

export { PAGE_SIZE };
