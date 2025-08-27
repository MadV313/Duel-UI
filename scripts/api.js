// /scripts/api.js (ESM)
export const API_BASE =
  new URLSearchParams(location.search).get('api') || '/api';
