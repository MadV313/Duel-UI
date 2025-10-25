// scripts/config.js
// Centralized client config + sane API base detection.
// Prefers the UI’s reverse-proxy (/api → backend) but still honors ?api= overrides.
// Non-breaking: adds HUB_BASE + PLAYER_TOKEN helpers while preserving existing exports/behavior.

const qs = new URLSearchParams(location.search);

/* ---------------- API base ----------------
 * Priority:
 *  1) window.API_BASE (set by index.html bootstrap)
 *  2) ?api=... (can be absolute or relative)
 *  3) '/api' fallback (works with our UI proxy)
 *
 * We only trim a single trailing slash; we do NOT force-append '/api' here
 * to keep compatibility with callers that already provide a full base.
 */
const _rawApiBase =
  (typeof window !== 'undefined' && window.API_BASE) ||
  qs.get('api') ||
  (location.hostname === 'localhost' ? 'http://localhost:3000' : '/api');

export const API_BASE = String(_rawApiBase).replace(/\/+$/, '');

// Also expose globally so non-ESM inline code can use it if needed
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
}

/* ---------------- UI base (for deep links) ---------------- */
export const UI_BASE =
  qs.get('ui') ||
  (typeof window !== 'undefined' && window.DUEL_UI_URL) ||
  location.origin;

/* ---------------- Optional Hub base (used by return-to-hub links) ---------------- */
export const HUB_BASE =
  qs.get('hub') ||
  (typeof window !== 'undefined' && window.HUB_UI_URL) ||
  'https://madv313.github.io/HUB-UI';

/* ---------------- Token handling (optional) ----------------
 * Provide a common way to read/write the player token used by multiple screens.
 * This does NOT initiate any network request by itself.
 */
export const PLAYER_TOKEN = (() => {
  const fromQs = qs.get('token') || '';
  if (fromQs) {
    try { localStorage.setItem('sv13.token', fromQs); } catch {}
    return fromQs;
  }
  try { return localStorage.getItem('sv13.token') || ''; } catch { return ''; }
})();

if (typeof window !== 'undefined') {
  window.PLAYER_TOKEN = PLAYER_TOKEN;
}

/* ---------------- Gameplay & UI defaults ---------------- */
export const CONFIG = {
  mode: qs.get('mode') || 'practice',
  spectator: qs.get('spectator') === 'true',
  mock: qs.get('mock') === 'true',

  // Core duel config
  startHP: 200,
  handLimit: 4,
  coinFlipDurationMs: 1500,

  // Endpoints
  apiBase: API_BASE,
  uiBase: UI_BASE,
  hubBase: HUB_BASE,
};

// Mirror for easy global access
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

/* ---------------- Helpers ---------------- */
export function apiUrl(path = '') {
  const p = String(path || '');
  // Allow callers to pass with or without leading slash
  return API_BASE + (p.startsWith('/') ? p : `/${p}`);
}

/** Append token/api to a URL (used by cross-UI links). */
export function withTokenAndApi(url) {
  try {
    const u = new URL(url, location.origin);
    if (PLAYER_TOKEN) u.searchParams.set('token', PLAYER_TOKEN);
    if (API_BASE) u.searchParams.set('api', API_BASE);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    const parts = [];
    if (PLAYER_TOKEN) parts.push(`token=${encodeURIComponent(PLAYER_TOKEN)}`);
    if (API_BASE) parts.push(`api=${encodeURIComponent(API_BASE)}`);
    return parts.length ? `${url}${sep}${parts.join('&')}` : url;
  }
}

/* ---------------- Friendly boot log ---------------- */
try {
  // eslint-disable-next-line no-console
  console.log('[UI] CONFIG:', {
    apiBase: API_BASE,
    uiBase: UI_BASE,
    hubBase: HUB_BASE,
    mode: CONFIG.mode,
    spectator: CONFIG.spectator,
    mock: CONFIG.mock,
    hasToken: !!PLAYER_TOKEN,
  });
} catch { /* noop */ }
