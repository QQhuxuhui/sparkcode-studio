import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { templatesRouter } from './routes/templates.js';
import { env } from './env.js';
import { closeDb } from './db/client.js';
import { existsSync } from 'node:fs';

const app = new Hono();
app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: '*',           // public read; relax further if you ever add auth
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// === API ===
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));
app.route('/api/v1/templates', templatesRouter);

// === Static frontend (only in production: dist/ exists after `pnpm build`) ===
const distDir = './dist';
if (existsSync(distDir)) {
  app.use('/*', serveStatic({ root: distDir }));
  // SPA fallback for client-side router
  app.get('*', serveStatic({ path: `${distDir}/index.html` }));
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[sparkcode-studio-api] http://localhost:${info.port}`);
});

const shutdown = async () => {
  console.log('shutting down…');
  await closeDb();
  server.close();
  process.exit(0);
};
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
