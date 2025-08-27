<!-- /scripts/fetch-shim.js -->
<script>
  (function () {
    const PREFIXES = ['/duel','/bot','/summary','/user','/packReveal','/collection','/reveal'];

    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        // String URL
        if (typeof input === 'string') {
          if (input.startsWith('/') &&
              !input.startsWith('/api/') &&
              PREFIXES.some(p => input.startsWith(p))) {
            input = window.API_BASE + input;
          }
        }
        // Request object
        else if (input && input.url) {
          const u = new URL(input.url, location.origin);
          if (u.origin === location.origin &&
              !u.pathname.startsWith('/api/') &&
              PREFIXES.some(p => u.pathname.startsWith(p))) {
            const rewritten = window.API_BASE + u.pathname + u.search;
            input = new Request(rewritten, input);
          }
        }
      } catch (e) {
        console.warn('[UI] fetch-shim warn:', e);
      }
      return origFetch(input, init);
    };

    console.log('[UI] fetch-shim active; prefixes →', PREFIXES, 'base =', window.API_BASE);
  })();
</script>
