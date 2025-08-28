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

// ---- Public backend (always reachable from browsers)
const PUBLIC_API = (process.env.DUEL_BACKEND_URL || 'https://duel-bot-production.up.railway.app').replace(/\/$/, '');

// ---- Detect Railway so we can try the private hostname
const ON_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

// You can override these if your service name/port differs on Railway
const BACKEND_SERVICE_NAME = process.env.BACKEND_SERVICE_NAME || 'duel-bot';
const BACKEND_PORT         = process.env.BACKEND_PORT || '3000';

// Private-first candidate (only valid inside Railway’s network)
const INTERNAL_DEFAULT = ON_RAILWAY ? `http://${BACKEND_SERVICE_NAME}.railway.internal:${BACKEND_PORT}` : null;

// Candidates we’ll try in order (first truthy that responds wins)
const CANDIDATES = [
  process.env.API_TARGET?.replace(/\/$/, ''), // explicit override (optional)
  INTERNAL_DEFAULT,                           // private first (Railway only)
  PUBLIC_API                                  // public fallback (always last)
].filter(Boolean);

let CURRENT_TARGET = CANDIDATES.at(-1); // default to public until we probe

function log(...args) { console.log('[ui]', ...args); }

log('BOOT env UI:', {
  NODE_ENV: process.env.NODE_ENV,
  NODE_VER: process.version,
  PORT: String(PORT),
  PWD: process.cwd(),
  FILES: (() => { try { return fs.readdirSync('.'); } catch { return []; } })(),
  ON_RAILWAY,
  PUBLIC_API,
  BACKEND_SERVICE_NAME,
  BACKEND_PORT,
  CANDIDATES,
});

// ---- Simple probe for a base URL (prefer /health; fallback /duel/status)
async function canReach(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    let res = await fetch(`${base}/health`, { signal: controller.signal });
    if (res.ok) return true;
  } catch { /* try next path */ }
  finally {
    clearTimeout(timer);
  }

  const controller2 = new AbortController();
  const timer2 = setTimeout(() => controller2.abort(), 2500);
  try {
    const res2 = await fetch(`${base}/duel/status`, { signal: controller2.signal });
    return res2.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer2);
  }
}

// Pick the best target now, and keep probing in the background
async function chooseTarget() {
  for (const base of CANDIDATES) {
    if (!base) continue;
    if (await canReach(base)) return base;
  }
  return PUBLIC_API; // last resort
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

// ---- Health & debug
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));
app.get('/__whoami', (_req, res) => res.json({ currentTarget: CURRENT_TARGET, candidates: CANDIDATES }));
app.get('/__ping', async (_req, res) => {
  const ok = await canReach(CURRENT_TARGET);
  res.json({ ok, target: CURRENT_TARGET });
});
app.get('/__proxycheck', async (_req, res) => {
  try {
    const ok = await canReach(CURRENT_TARGET);
    res.json({ ok, target: `${CURRENT_TARGET}/health` });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e), target: `${CURRENT_TARGET}/health` });
  }
});

// ---- Static site (index.html at repo root)
app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'] }));

// ---- API proxy: browser hits /api/* → we forward to CURRENT_TARGET
app.use(
  '/api',
  createProxyMiddleware({
    changeOrigin: true,
    xfwd: true,
    // honor CURRENT_TARGET dynamically
    router: () => CURRENT_TARGET,
    pathRewrite: { '^/api': '' },
    proxyTimeout: 10000,
    timeout: 10000,
    onProxyReq: (proxyReq, req) => {
      log('proxy', { method: req.method, url: req.url, target: CURRENT_TARGET });
    },
    onError: (err, _req, res) => {
      log('proxy error:', err?.message || err);
      res.status(502).json({ error: 'Bad gateway (UI→API proxy failed)', detail: String(err?.message || err) });
    },
  })
);

// ---- SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log(`Duel-UI listening on ${PORT}, index=${path.join(__dirname, 'index.html')}`);
});
