// scripts/config.js — canonical production configuration for the session-backed Duel UI.
// Production identity is carried only by ?session=<id>&token=<viewer>.

const qs = new URLSearchParams(window.location.search);

function trimBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function validAbsoluteHttp(value) {
  try {
    const u = new URL(String(value || ''));
    return /^https?:$/.test(u.protocol) ? trimBase(u.toString()) : '';
  } catch {
    return '';
  }
}

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// Production is pinned to the canonical API. The ?api= override is accepted only
// while the UI itself is running locally, so a crafted production link cannot
// redirect private duel credentials to an arbitrary origin.
const devApi = isLocal ? validAbsoluteHttp(qs.get('api')) : '';

export const API_BASE = devApi || (isLocal ? 'http://localhost:3000' : 'https://api.sv13tcg.com');
export const UI_BASE = 'https://duel.sv13tcg.com';
export const HUB_BASE = 'https://sv13tcg.com';
export const SUMMARY_BASE = 'https://summary.sv13tcg.com';
export const SPECTATOR_BASE = 'https://spectate.sv13tcg.com';
export const SESSION_ID = String(qs.get('session') || '').trim();
export const PLAYER_TOKEN = String(qs.get('token') || '').trim();
export const MOCK_MODE = qs.get('mock') === '1' || qs.get('mock') === 'true';

export const CONFIG = Object.freeze({
  apiBase: API_BASE,
  uiBase: UI_BASE,
  hubBase: HUB_BASE,
  summaryBase: SUMMARY_BASE,
  spectatorBase: SPECTATOR_BASE,
  sessionId: SESSION_ID,
  playerToken: PLAYER_TOKEN,
  mock: MOCK_MODE,
  pollMs: 1500,
  hiddenPollMs: 8000,
  maxPollBackoffMs: 30000,
});

export function apiUrl(path = '') {
  const p = String(path || '');
  return `${API_BASE}${p.startsWith('/') ? p : `/${p}`}`;
}

export function summaryUrl(sessionId = SESSION_ID) {
  const u = new URL(SUMMARY_BASE);
  if (sessionId) u.searchParams.set('duelId', sessionId);
  return u.toString();
}

export function hubUrl() {
  return HUB_BASE;
}

export function spectatorUrl(sessionId = SESSION_ID) {
  const u = new URL(SPECTATOR_BASE);
  if (sessionId) u.searchParams.set('session', sessionId);
  return u.toString();
}

if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  window.DUEL_UI_URL = UI_BASE;
  window.HUB_UI_URL = HUB_BASE;
  window.DUEL_SESSION_ID = SESSION_ID;
  // Deliberately do not mirror or persist the viewer token into legacy globals/localStorage.
}
