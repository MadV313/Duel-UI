// server.mjs — Duel-UI (auto-fallback proxy)
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 8080;

// Public backend (always available)
const PUBLIC_API = (process.env.DUEL_BACKEND_URL || 'https://duel-bot-production.up.railway.app').replace(/\/$/, '');

// Detect Railway so we can try the private hostname
const ON_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

// Candidates we’ll try in order
const CANDIDATES = [
  process.env.API_TARGET?.replace(/\/$/, ''),                   // explicit override (optional)
  ON_RAILWAY ? 'http://duel-bot.railway.internal:8080' : null, // private first (Railway only)
  PUBLIC_API                                                    // public fallback (always last)
].filter(Boolean);

let CURRENT_TARGET = CANDIDATES.at(-1); // default: last one (public) until proven otherwise

function log(...args) { console.log('[ui]', ...args); }

log('BOOT env UI:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: String(PORT),
  PWD: process.cwd(),
  FILES: (() => { try { return fs.readdirSync('.'); } catch { return []; } })(),
  ON_RAILWAY,
  PUBLIC_API,
  CANDIDATES
});

// Simple probe for a base URL
async function canReach(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${base}/duel/status`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Pick the best target now, and keep probing in the background
async function chooseTarget() {
  for (const base of CANDIDATES) {
    if (!base) continue;
    if (await canReach(base)) return base;
  }
  return PUBLIC_API;
}

(async () => {
  const first = await chooseTarget();
  CURRENT_TARGET = first;
  log('Proxy target selected:', CURRENT_TARGET);

  // Re-probe every 20s — flip if a better target is available
  setInterval(async () => {
    try {
      const next = await chooseTarget();
      if (next !== CURRENT_TARGET) {
        log('Proxy target switch:', { from: CURRENT_TARGET, to: next });
        CURRENT_TARGET = next;
      }
    } catch (e) {
      log('Probe error:', e?.message || e);
    }
  }, 20000);
})();

// --- Health + debug
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));
app.get('/__whoami', (_req, res) => res.json({ currentTarget: CURRENT_TARGET, candidates: CANDIDATES }));
app.get('/__proxycheck', async (_req, res) => {
  try {
    const ok = await canReach(CURRENT_TARGET);
    res.json({ ok, target: CURRENT_TARGET + '/duel/status' });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e), target: CURRENT_TARGET + '/duel/status' });
  }
});

// --- Static site (index.html at repo root)
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

// --- API proxy: browser hits /api/* → we forward to CURRENT_TARGET
app.use(
  '/api',
  createProxyMiddleware({
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { '^/api': '' },
    router: () => CURRENT_TARGET,
    onProxyReq: (proxyReq, req) => {
      log('proxy', { method: req.method, url: req.url, target: CURRENT_TARGET });
    },
    onError: (err, _req, res) => {
      log('proxy error:', err?.message || err);
      res.status(502).json({ error: 'Bad gateway (UI→API proxy failed)', detail: String(err?.message || err) });
    }
  })
);

// --- SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log(`Duel-UI listening on ${PORT}, index=${path.join(__dirname, 'index.html')}`);
});
