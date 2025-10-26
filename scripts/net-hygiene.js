// scripts/net-hygiene.js (optional shared helper you can include in both repos)
// Or just paste these into the files I call out below.

export const NET_LIMITS = {
  // Socket reconnection
  RECONNECT_DELAY_MAX_MS: 20000, // 20s ceiling
  RECONNECT_ATTEMPTS: 10,

  // Typing
  TYPING_MIN_INTERVAL_MS: 2000,  // emit at most once every 2s
  TYPING_IDLE_STOP_MS: 1600,     // send one "stop typing" after idle

  // Visibility debounce
  VISIBILITY_RESUME_DELAY_MS: 200, // fire one catch-up after becoming visible

  // 🔧 Duel UI resolve poll (used in scripts/duel.js; safe default)
  DUEL_RESOLVE_POLL_MS: 1000,

  // 🔧 (Optional) Spectator poll hints; your spectator script may ignore these
  SPECTATOR_POLL_BASE_MS: 3000,
  SPECTATOR_POLL_MAX_MS: 15000,
};

export function pageHidden() { return document.hidden; }
