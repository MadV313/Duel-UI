// scripts/api-base.js
// Determines the base URL the UI should use for API calls.
// Priority:
//   1) window.API_BASE (if index.html set it early)
//   2) ?api=https://host[:port] (absolute URL override)
//   3) default UI proxy at /api

const params   = new URLSearchParams(window.location.search);
const override = params.get('api');           // e.g. ?api=http://localhost:3000
const TOKEN    = params.get('token') || '';   // expose token for modules that need it
const IMG_BASE = (params.get('imgbase') || '').replace(/\/+$/, '');

function normalizeApiOverride(v) {
  if (!v) return null;
  // Accept absolute only; anything else gets ignored (we'll use /api)
  if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  // Gracefully handle a user passing '/api' or 'api'
  if (v === '/api' || v === 'api') return '/api';
  return null;
}

const API_BASE = (() => {
  // If index.html already put a value on window, honor it.
  if (typeof window !== 'undefined' && window.API_BASE) {
    return String(window.API_BASE).replace(/\/+$/, '') || '/api';
  }
  // Else consider ?api= override (absolute only)
  const normalized = normalizeApiOverride(override);
  if (normalized) return normalized;
  // Default: go through UI → backend proxy mounted at /api
  return '/api';
})();

// Convenience helper for composing URLs safely.
const apiUrl = (p = '') => API_BASE + (p.startsWith('/') ? p : `/${p}`);

// 🔸 Small helpers used across the UI
function authHeaders(extra = {}) {
  return {
    ...(TOKEN ? { 'X-Player-Token': TOKEN } : {}),
    ...extra,
  };
}

function withTokenAndApi(url) {
  try {
    const u = new URL(url, location.origin);
    if (TOKEN)    u.searchParams.set('token', TOKEN);
    if (API_BASE) u.searchParams.set('api', API_BASE);
    if (IMG_BASE) u.searchParams.set('imgbase', IMG_BASE);
    return u.toString();
  } catch {
    const hasQ = url.includes('?');
    const parts = [];
    if (TOKEN)    parts.push(`token=${encodeURIComponent(TOKEN)}`);
    if (API_BASE) parts.push(`api=${encodeURIComponent(API_BASE)}`);
    if (IMG_BASE) parts.push(`imgbase=${encodeURIComponent(IMG_BASE)}`);
    return parts.length ? `${url}${hasQ ? '&' : '?'}${parts.join('&')}` : url;
  }
}

// Expose globally (for inline handlers or legacy code)
try {
  window.API_BASE = API_BASE;
  window.apiUrl   = apiUrl;
  window.TOKEN    = TOKEN;
  window.USER_TOKEN = TOKEN;          // alias used by some modules
  if (IMG_BASE) window.IMG_BASE = IMG_BASE;
  window.authHeaders     = authHeaders;
  window.withTokenAndApi = withTokenAndApi;

  // Light token persistence (helps modules that read from localStorage)
  if (TOKEN) localStorage.setItem('sv13.token', TOKEN);
} catch { /* no-op in strict envs */ }

// Also export for ES module consumers
export { API_BASE, apiUrl, TOKEN, IMG_BASE, authHeaders, withTokenAndApi };

// Tiny boot log
try {
  console.log('[UI] API_BASE =', API_BASE, 'TOKEN?', Boolean(TOKEN), 'IMG_BASE =', IMG_BASE || '(default)');
} catch {}
