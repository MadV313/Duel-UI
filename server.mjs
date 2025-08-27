// server.mjs — Duel-UI
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
// IMPORTANT: listen on PORT if Railway sets it, otherwise 8080 is fine
const PORT = process.env.PORT || 8080;

// Public backend (fallback for local/dev)
const PUBLIC_API = (process.env.DUEL_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// Prefer the private hostname when on Railway (server→server, no edge)
const ON_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

// If your backend service name on Railway is “Duel-Bot”, the private DNS is “duel-bot.railway.internal”
const INTERNAL_API = ON_RAILWAY ? 'http://duel-bot.railway.internal:8080' : PUBLIC_API;

console.log('BOOT env UI:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: String(PORT),
  PWD: process.cwd(),
  FILES: (() => { try { return fs.readdirSync('.'); } catch { return []; } })(),
  PUBLIC_API,
  INTERNAL_API,
  ON_RAILWAY
});

// ──────────────────────────────────────────────────────────
// Basic request logger so you see hits in Deploy logs
// ──────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use((req, _res, next) => {
  console.log(`[ui] ${req.method} ${req.originalUrl}`);
  next();
});

// ──────────────────────────────────────────────────────────
// Health + quick probes (hit these in your browser)
// ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));
app.get('/__ping', (_req, res) => res.type('text/plain').send(`pong ${Date.now()}`));

// From the UI container, call the backend directly (private network on Railway)
app.get('/__proxycheck', async (_req, res) => {
  try {
    const r = await fetch(`${INTERNAL_API}/duel/status`, { method: 'GET' });
    const txt = await r.text();
    res.json({ ok: r.ok, status: r.status, bodyPreview: txt.slice(0, 400), target: `${INTERNAL_API}/duel/status` });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e), target: `${INTERNAL_API}/duel/status` });
  }
});

// ──────────────────────────────────────────────────────────
// Static files (index.html lives at repo root)
// ──────────────────────────────────────────────────────────
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

// Explicit root handler (faster than wildcard behind some proxies)
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ──────────────────────────────────────────────────────────
// API proxy: browser hits /api/* → forward to backend (private when possible)
// ──────────────────────────────────────────────────────────
app.use(
  '/api',
  createProxyMiddleware({
    target: INTERNAL_API,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { '^/api': '' },
    onProxyReq: (_proxyReq, req) => {
      console.log('[ui→api] proxy', { method: req.method, url: req.url, target: INTERNAL_API });
    },
    onError: (err, _req, res) => {
      console.error('[ui→api] proxy error:', err?.message || err);
      if (!res.headersSent) res.status(502).json({ error: 'Bad gateway (UI→API proxy failed)' });
    },
  })
);

// Single-page fallback (so /?mode=practice etc. loads index.html)
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Global error handler (last resort)
app.use((err, _req, res, _next) => {
  console.error('UI server error:', err);
  res.status(500).type('text/plain').send('UI server error');
});

// Safety logs
process.on('unhandledRejection', r => console.error('UI unhandledRejection:', r));
process.on('uncaughtException', e => console.error('UI uncaughtException:', e));

// Listen
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Duel-UI listening on ${PORT}, index=${path.join(__dirname, 'index.html')}`);
});
