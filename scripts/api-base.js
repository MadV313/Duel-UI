<!-- /scripts/api-base.js -->
<script>
  // Prefer the reverse proxy on the same domain: /api
  // but keep the ?api=... override for local/dev/testing.
  (function () {
    const params = new URLSearchParams(location.search);
    const override = params.get('api');         // e.g. ?api=https://duel-bot-production.up.railway.app
    const base = override || '/api';            // proxy first, override optional
    // expose globally so any script can use it
    window.API_BASE = base.replace(/\/$/, '');  // trim trailing slash
    console.log('[UI] API_BASE =', window.API_BASE);
  })();
</script>
