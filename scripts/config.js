// scripts/config.js
const qs = new URLSearchParams(location.search);

export const API_BASE =
  qs.get("api") ||                         // preferred: passed by the /practice button
  window.DUEL_BACKEND_URL ||               // optional global if you ever inject it
  localStorage.getItem("DUEL_API") ||      // optional manual override for dev
  (location.hostname === "localhost"       // fallback
    ? "http://localhost:8080"
    : location.origin);

export const UI_BASE =
  qs.get('ui') ||
  window.DUEL_UI_URL ||
  location.origin;
