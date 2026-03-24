/**
 * Converts a title string to a URL-safe slug.
 * e.g. "Hello, World! 2026" → "hello-world-2026"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')      // remove non-alphanumeric
    .trim()
    .replace(/[\s_-]+/g, '-')          // spaces/underscores → hyphens
    .replace(/^-+|-+$/g, '');          // trim leading/trailing hyphens
}
