// /scripts/fetch-shim.js
// Side-effect module that transparently rewrites UI → API calls.
// Any relative fetch starting with one of the prefixes below will be
// rewritten to `${window.API_BASE}<path>` (e.g. '/duel/state' → '/api/duel/state').

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

  window.fetch = function (input, init) {
    try {
      // String URL
      if (typeof input === 'string') {
        if (
          input.startsWith('/') &&
          !input.startsWith('/api/') &&
          PREFIXES.some(p => input.startsWith(p))
        ) {
          input = base + input;
        }
      }
      // Request object
      else if (input && input.url) {
        const u = new URL(input.url, location.origin);
        if (
          u.origin === location.origin &&
          !u.pathname.startsWith('/api/') &&
          PREFIXES.some(p => u.pathname.startsWith(p))
        ) {
          const rewritten = base + u.pathname + u.search;
          input = new Request(rewritten, input);
        }
      }
    } catch (e) {
      console.warn('[UI] fetch-shim warn:', e);
    }
    return origFetch(input, init);
  };

  console.log('[UI] fetch-shim active;', { base, PREFIXES });
})();
