import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types.js';
import { publicRouter } from './routes/public.js';
import { apiRouter } from './routes/api.js';

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ─────────────────────────────────────────────────────────────

app.use('*', logger());

// Allow cross-origin requests to the API (useful when running admin from
// a different origin during development).
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ── API routes ─────────────────────────────────────────────────────────────

app.route('/api', apiRouter);

// ── Public blog routes ─────────────────────────────────────────────────────

app.route('/', publicRouter);

// ── Admin static files — served from ./public via Assets binding ───────────
// Requests to /admin/* that are NOT matched above fall through to the Assets
// binding automatically (wrangler handles this with "assets.not_found_handling").
// No extra code needed here.

// ── 404 fallback ───────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.text('Not found', 404);
});

// ── Error handler ──────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('[Worker Error]', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
