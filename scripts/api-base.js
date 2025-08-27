// scripts/api-base.js
// Determines the base URL the UI should use for API calls.
// Prefer the UI’s own proxy at `/api`, but allow ?api=https://... override for dev.

const params = new URLSearchParams(window.location.search);
const override = params.get('api'); // e.g. ?api=http://localhost:3000

// If override is a full URL, use it (trim trailing slash). Otherwise default to the UI proxy.
const API_BASE = (() => {
  if (override && /^https?:\/\//i.test(override)) {
    return override.replace(/\/$/, '');
  }
  // Default: go through UI → backend proxy mounted at /api
  return '/api';
})();

// Convenience helper for composing URLs safely.
const apiUrl = (p = '') => API_BASE + (p.startsWith('/') ? p : `/${p}`);

// Expose globally (for inline handlers or legacy code)
window.API_BASE = API_BASE;
window.apiUrl = apiUrl;

// Also export for ES module consumers
export { API_BASE, apiUrl };

// Tiny boot log
try {
  console.log('[UI] API_BASE =', API_BASE);
} catch {}
