// scripts/api.js (ESM)
// Centralized helpers for talking to the backend.
// Uses the UI proxy at `/api` by default, with optional ?api=https://... override.
//
// Other modules can either:
//   import { API_BASE, apiUrl, getJSON, postJSON, DuelAPI } from './api.js';
// …or keep using window.API_BASE that api-base.js sets for legacy code.

import { API_BASE, apiUrl } from './api-base.js';

// ———————————————————————————————————————————
// Low-level helpers
// ———————————————————————————————————————————

async function safeFetch(input, init = {}) {
  // Accept either a full path or already-built URL
  const url = typeof input === 'string' ? apiUrl(input) : input;

  const res = await fetch(url, {
    // Forward JSON content-type automatically when body is an object
    ...init,
    headers: {
      'Accept': 'application/json',
      ...(init.body && typeof init.body === 'object' && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers || {}),
    },
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
    const message =
      (data && data.error) ||
      `${res.status} ${res.statusText || ''}`.trim();
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    err.url = url;
    throw err;
  }

  return data;
}

async function getJSON(path) {
  return safeFetch(path, { method: 'GET' });
}

async function postJSON(path, body) {
  const payload =
    body && typeof body === 'object' && !(body instanceof FormData)
      ? JSON.stringify(body)
      : body;
  return safeFetch(path, { method: 'POST', body: payload });
}

// ———————————————————————————————————————————
// High-level, semantically named endpoints
// (keeps call-sites tidy and consistent)
// ———————————————————————————————————————————

export const DuelAPI = {
  // Health / debug
  status: () => getJSON('/duel/status'),               // GET
  state: () => getJSON('/duel/state'),                 // GET
  practice: () => getJSON('/bot/practice'),            // GET (alias also at /duel/practice)
  turn: (payload) => postJSON('/duel/turn', payload),  // POST
  summary: (duelId) => getJSON(`/summary/${encodeURIComponent(duelId)}`),
  user: (id) => getJSON(`/user/${encodeURIComponent(id)}`),
  revealPack: () => getJSON('/packReveal/revealPack'),

  // UI proxy check (defined in UI server.mjs)
  proxyCheck: () => getJSON('/__proxycheck'),
};

// Re-export base utilities so consumers only import from one place
export { API_BASE, apiUrl, getJSON, postJSON };

// Tiny boot log so we can confirm wiring in console
try {
  console.log('[API] base =', API_BASE);
} catch {}
