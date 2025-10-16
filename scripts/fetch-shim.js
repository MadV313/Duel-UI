// /scripts/fetch-shim.js
// Side-effect module that transparently rewrites UI → API calls.
// Any relative fetch starting with one of the prefixes below will be
// rewritten to `${window.API_BASE}<path>` (e.g. '/duel/state' → '/api/duel/state').
//
// ✨ Plus: if a player token is present (?token=... or localStorage 'sv13.token'),
// we automatically attach it as 'X-Player-Token' for same-origin API calls
// unless the caller already set that header.

(() => {
  if (window.__FETCH_SHIM_INSTALLED__) return;
  window.__FETCH_SHIM_INSTALLED__ = true;

  const PREFIXES = [
    '/duel',
    '/bot',
    '/summary',
    '/user',
    '/packReveal',
    '/collection',
    '/reveal'
  ];

  const base = (window.API_BASE || '/api').replace(/\/$/, '');
  const origFetch = window.fetch.bind(window);

  // Discover token once (URL param first, then persisted)
  let TOKEN = '';
  try {
    const qs = new URLSearchParams(location.search);
    TOKEN = qs.get('token') || localStorage.getItem('sv13.token') || '';
  } catch { /* ignore */ }

  function needsRewrite(pathname) {
    return (
      pathname.startsWith('/') &&
      !pathname.startsWith('/api/') &&
      PREFIXES.some(p => pathname.startsWith(p))
    );
  }

  function withTokenHeader(init) {
    const next = init ? { ...init } : {};
    const headers = new Headers(next.headers || undefined);
    if (TOKEN && !headers.has('X-Player-Token')) {
      headers.set('X-Player-Token', TOKEN);
    }
    next.headers = headers;
    // Keep credentials as-is; default to same-origin
    if (!next.credentials) next.credentials = 'same-origin';
    return next;
  }

  window.fetch = function (input, init) {
    try {
      // String URL
      if (typeof input === 'string') {
        if (needsRewrite(input)) {
          input = base + input;
          init = withTokenHeader(init);
        }
      }
      // Request object
      else if (input && input.url) {
        const u = new URL(input.url, location.origin);
        if (u.origin === location.origin && needsRewrite(u.pathname)) {
          const rewritten = base + u.pathname + u.search;
          const headers = new Headers(input.headers || undefined);
          if (TOKEN && !headers.has('X-Player-Token')) {
            headers.set('X-Player-Token', TOKEN);
          }
          // Rebuild the Request while preserving most properties
          input = new Request(rewritten, {
            method: input.method,
            headers,
            body: input.body,
            mode: input.mode,
            credentials: input.credentials || 'same-origin',
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            referrerPolicy: input.referrerPolicy,
            integrity: input.integrity,
            keepalive: input.keepalive,
            signal: input.signal
          });
        }
      }
    } catch (e) {
      console.warn('[UI] fetch-shim warn:', e);
    }
    return origFetch(input, init);
  };

  console.log('[UI] fetch-shim active;', { base, PREFIXES, tokenAttached: Boolean(TOKEN) });
})();
