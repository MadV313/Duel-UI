<!-- /scripts/api-base.js -->
<script>
  (function () {
    const params = new URLSearchParams(location.search);
    const override = params.get('api');          // still works for dev: ?api=http(s)://...
    const base = (override || '/api').replace(/\/$/, '');
    window.API_BASE = base;
    console.log('[UI] API_BASE =', window.API_BASE);
  })();
</script>
