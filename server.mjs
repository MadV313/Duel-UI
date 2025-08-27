// server.mjs — Duel-UI
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 8080;

// Public backend (used locally or as fallback)
const PUBLIC_API = (process.env.DUEL_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// If we’re on Railway, prefer the private hostname for server→server calls
const ON_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const INTERNAL_API = ON_RAILWAY ? 'http://duel-bot.railway.internal:8080' : PUBLIC_API;

console.log('BOOT env UI:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: String(PORT),
  PWD: process.cwd(),
  FILES: (() => { try { return require('fs').readdirSync('.'); } catch { return []; } })(),
  PUBLIC_API,
  INTERNAL_API,
  ON_RAILWAY
});

// Health
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));

// Static files (index.html at repo root)
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

// API proxy: the browser hits /api/* → we forward to backend (private when possible)
app.use(
  '/api',
  createProxyMiddleware({
    target: INTERNAL_API,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { '^/api': '' },
    onProxyReq: (proxyReq, req) => {
      console.log('[ui→api] proxy', {
        method: req.method,
        url: req.url,
        target: INTERNAL_API
      });
    },
    onError: (err, _req, res) => {
      console.error('[ui→api] proxy error:', err?.message || err);
      res.status(502).json({ error: 'Bad gateway (UI→API proxy failed)' });
    }
  })
);

// Single-page fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Duel-UI listening on ${PORT}, index=${path.join(__dirname, 'index.html')}`);
});
