// scripts/api-base.js
// Determines the base URL the UI should use for API calls.
// Priority:
//   1) window.API_BASE (if index.html set it early)
//   2) ?api=https://host[:port] (absolute URL override)
//   3) default UI proxy at /api

const params   = new URLSearchParams(window.location.search);
const override = params.get('api');           // e.g. ?api=http://localhost:3000
const TOKEN    = params.get('token') || '';   // expose token for modules that need it

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

// Expose globally (for inline handlers or legacy code)
try {
  window.API_BASE = API_BASE;
  window.apiUrl   = apiUrl;
  window.TOKEN    = TOKEN;
} catch { /* no-op in strict envs */ }

// Also export for ES module consumers
export { API_BASE, apiUrl, TOKEN };

// Tiny boot log
try { console.log('[UI] API_BASE =', API_BASE, 'TOKEN?', Boolean(TOKEN)); } catch {}
