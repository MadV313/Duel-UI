// scripts/config.js
// Centralized client config + sane API base detection.
// Prefers the UI’s reverse-proxy (/api → backend) but still honors ?api= overrides.

const qs = new URLSearchParams(location.search);

// If /scripts/api-base.js ran, it set window.API_BASE already.
// Otherwise: honor ?api=..., else prefer '/api' (works with our UI proxy).
const _computedApiBase =
  (typeof window !== 'undefined' && window.API_BASE) ||
  qs.get('api') ||
  (location.hostname === 'localhost' ? 'http://localhost:3000' : '/api');

export const API_BASE = String(_computedApiBase).replace(/\/$/, '');

// Also expose globally so non-ESM inline code can use it if needed
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
}

// UI base (rarely needed; here for completeness / deep links)
export const UI_BASE =
  qs.get('ui') ||
  (typeof window !== 'undefined' && window.DUEL_UI_URL) ||
  location.origin;

// Gameplay & UI defaults used around the app
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
};

// Mirror for easy global access
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// Small helper to build API urls consistently
export function apiUrl(path = '') {
  const p = String(path || '');
  return API_BASE + (p.startsWith('/') ? p : `/${p}`);
}

// Friendly boot log
try {
  // eslint-disable-next-line no-console
  console.log('[UI] CONFIG:', {
    apiBase: API_BASE,
    uiBase: UI_BASE,
    mode: CONFIG.mode,
    spectator: CONFIG.spectator,
    mock: CONFIG.mock,
  });
} catch { /* noop */ }
