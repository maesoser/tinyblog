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

// ── Admin static files — guarded by Cloudflare Access header check ─────────
// We intercept /admin/* in Hono before the Assets binding can serve them.
// If the Cf-Access-Jwt-Assertion header is absent, Cloudflare Access is not
// sitting in front of this route — return a clear HTML error page.
// Full JWT verification is handled by the /api/* middleware; here we only
// check header presence so we can surface a helpful error for direct access.

app.use('/admin/*', async (c, next) => {
  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) {
    return c.html(/* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access Denied</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 540px; margin: 10vh auto; padding: 0 1.5rem; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    p  { line-height: 1.6; color: #444; }
    code { background: #f3f3f3; padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Access Denied</h1>
  <p>
    The <code>Cf-Access-Jwt-Assertion</code> header is missing.
    Cloudflare Access policies do not appear to be configured for this application.
  </p>
  <p>
    To access the admin panel, configure a Cloudflare Access Application that
    protects this domain, then visit this page through the Access-secured URL.
  </p>
</body>
</html>`, 403);
  }
  return next();
});

// For /admin/* requests that pass the header check, proxy through to the
// Assets binding so Wrangler serves the correct static file.
app.get('/admin/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// ── API routes ─────────────────────────────────────────────────────────────

app.route('/api', apiRouter);

// ── Public blog routes ─────────────────────────────────────────────────────

app.route('/', publicRouter);

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
