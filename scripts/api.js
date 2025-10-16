// scripts/api.js (ESM)
// Centralized helpers for talking to the backend.
// Uses the UI proxy at `/api` by default, with optional ?api=https://... override.
//
// Other modules can either:
//   import { API_BASE, apiUrl, getJSON, postJSON, DuelAPI } from './api.js';
// …or keep using window.API_BASE that api-base.js sets for legacy code.

import { API_BASE, apiUrl, TOKEN } from './api-base.js';

// ———————————————————————————————————————————
// Internal utilities
// ———————————————————————————————————————————

function isAbsolute(u) {
  return /^https?:\/\//i.test(String(u || ''));
}

function appendTokenIfMissing(url) {
  if (!TOKEN) return url;
  try {
    const u = new URL(url, location.origin);
    if (!u.searchParams.has('token')) {
      u.searchParams.set('token', TOKEN);
    }
    return u.toString();
  } catch {
    // Fallback for relative strings without URL support
    const hasQuery = url.includes('?');
    const hasToken = /(?:^|[?&])token=/.test(url);
    if (hasToken) return url;
    return `${url}${hasQuery ? '&' : '?'}token=${encodeURIComponent(TOKEN)}`;
  }
}

// ———————————————————————————————————————————
// Low-level helpers
// ———————————————————————————————————————————

async function safeFetch(input, init = {}) {
  // Build the base URL first
  let builtUrl;
  if (typeof input === 'string') {
    builtUrl = isAbsolute(input) ? input : apiUrl(input);
  } else {
    builtUrl = input; // already a Request/URL
  }

  // Add token (query) if we have one and it’s not present yet
  builtUrl = appendTokenIfMissing(builtUrl);

  const headers = {
    Accept: 'application/json',
    // Forward JSON content-type automatically when body is an object
    ...(init.body &&
      typeof init.body === 'object' &&
      !(init.body instanceof FormData) && { 'Content-Type': 'application/json' }),
    // Informational header many backends accept; safe to include always
    ...(TOKEN ? { 'X-Player-Token': TOKEN } : {}),
    ...(init.headers || {}),
  };

  const res = await fetch(builtUrl, {
    ...init,
    headers,
    // If you need cookies/auth later, flip this to 'include'
    credentials: init.credentials || 'same-origin',
  });

  // Try to parse JSON, but don’t explode on plain text
  const text = await res.text().catch(() => '');
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = (data && data.error) || `${res.status} ${res.statusText || ''}`.trim();
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    err.url = builtUrl;
    throw err;
  }

  return data;
}

async function getJSON(path) {
  return safeFetch(path, { method: 'GET' });
}

async function postJSON(path, body) {
  const payload =
    body && typeof body === 'object' && !(body instanceof FormData) ? JSON.stringify(body) : body;
  return safeFetch(path, { method: 'POST', body: payload });
}

// ———————————————————————————————————————————
// High-level, semantically named endpoints
// (keeps call-sites tidy and consistent)
// ———————————————————————————————————————————

export const DuelAPI = {
  // Health / debug
  status: () => getJSON('/duel/status'),               // GET
  state:  () => getJSON('/duel/state'),                // GET
  practice: () => getJSON('/bot/practice'),            // GET (alias also at /duel/practice)
  turn:  (payload) => postJSON('/duel/turn', payload), // POST
  summary: (duelId) => getJSON(`/summary/${encodeURIComponent(duelId)}`),
  user:    (id) => getJSON(`/user/${encodeURIComponent(id)}`),
  revealPack: () => getJSON('/packReveal/revealPack'),

  // UI proxy check (defined in UI server.mjs)
  proxyCheck: () => getJSON('/__proxycheck'),
};

// Re-export base utilities so consumers only import from one place
export { API_BASE, apiUrl, getJSON, postJSON, TOKEN };

// Tiny boot log so we can confirm wiring in console
try {
  console.log('[API] base =', API_BASE, 'token?', Boolean(TOKEN));
} catch {}
