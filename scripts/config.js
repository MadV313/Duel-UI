// scripts/config.js
const qs = new URLSearchParams(location.search);

export const API_BASE =
  qs.get('api') ||                  // URL param override (best for prod buttons)
  window.DUEL_BACKEND_URL ||        // optional global injected by host
  localStorage.getItem('DUEL_API') ||
  (location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : 'https://duel-bot-backend-production.up.railway.app'); // safe prod default

export const UI_BASE =
  qs.get('ui') ||
  window.DUEL_UI_URL ||
  location.origin;
