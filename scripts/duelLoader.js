// scripts/duelLoader.js
// Auto-start loader for duels launched from Discord links (PvP or Practice)
// Now also carries the invoking player's ?token= (and ?api=, ?imgbase=) so the user
// can navigate back to Hub/other UIs with their identity intact.

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { apiUrl } from './api-base.js';

const qs = new URLSearchParams(location.search);

// Core params
const mode       = qs.get('mode');                 // e.g. "practice"
const player1Id  = qs.get('player1');
const player2Id  = qs.get('player2') || 'bot';

// Identity / routing params
const TOKEN   = qs.get('token') || '';
const API_QS  = (qs.get('api') || '').replace(/\/+$/, '');     // may be blank (UI proxy default)
const IMGB    = (qs.get('imgbase') || '').replace(/\/+$/, ''); // optional image base
const HUB_QS  = (qs.get('hub') || '').trim();

// Persist identity so other modules can access it (and for future reloads)
try {
  if (TOKEN) localStorage.setItem('sv13.token', TOKEN);
  if (API_QS) localStorage.setItem('sv13.api', API_QS);
  if (IMGB) localStorage.setItem('sv13.imgbase', IMGB);
  // also expose at runtime
  window.SV13 = Object.assign(window.SV13 || {}, { token: TOKEN, api: API_QS, imgbase: IMGB });
} catch { /* ignore */ }

// Ensure “Return to Hub” (and any other outbound links we add later) keep token/api/imgbase
(function wireOutboundLinks() {
  const withParams = (href) => {
    try {
      const u = new URL(href, location.href);
      if (TOKEN) u.searchParams.set('token', TOKEN);
      if (API_QS) u.searchParams.set('api', API_QS);
      if (IMGB) u.searchParams.set('imgbase', IMGB);
      u.searchParams.set('ts', String(Date.now())); // cache-bust
      return u.toString();
    } catch {
      // relative fallback
      const parts = [];
      if (TOKEN) parts.push(`token=${encodeURIComponent(TOKEN)}`);
      if (API_QS) parts.push(`api=${encodeURIComponent(API_QS)}`);
      if (IMGB) parts.push(`imgbase=${encodeURIComponent(IMGB)}`);
      parts.push(`ts=${Date.now()}`);
      const sep = href.includes('?') ? '&' : '?';
      return parts.length ? `${href}${sep}${parts.join('&')}` : href;
    }
  };

  // Known anchor(s)
  document.querySelectorAll('a.return-to-hub').forEach(a => {
    const base = HUB_QS || a.getAttribute('href') || 'https://madv313.github.io/HUB-UI/';
    a.href = withParams(base);
  });
})();

// Normalize server payload into the shape our UI expects
function normalizeServerState(data) {
  if (!data || typeof data !== 'object') return null;

  // Some backends use "bot" as a key — map it to player2 for UI simplicity
  if (data?.players?.bot && !data.players.player2) {
    data.players.player2 = data.players.bot;
    delete data.players.bot;
  }
  if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

  // Ensure players + containers exist
  data.players              ||= {};
  data.players.player1      ||= {};
  data.players.player2      ||= {};

  data.players.player1.hand        ||= [];
  data.players.player1.field       ||= [];
  data.players.player1.deck        ||= [];
  data.players.player1.discardPile ||= [];

  data.players.player2.hand        ||= [];
  data.players.player2.field       ||= [];
  data.players.player2.deck        ||= [];
  data.players.player2.discardPile ||= [];

  // Friendly labels for practice if server omitted them
  if (mode === 'practice') {
    data.players.player1.discordName ||= data.players.player1.discordName || data.players.player1.name || 'You';
    data.players.player2.discordName ||= data.players.player2.discordName || data.players.player2.name || 'Practice Bot';
  }

  return data;
}

async function loadPractice() {
  // If your backend scopes state by token, optionally include it as a header.
  // This is harmless if unused by the server.
  const headers = {};
  if (TOKEN) headers['X-Player-Token'] = TOKEN;

  // Try to read existing state first (Discord command already initialized it)
  let res = await fetch(apiUrl('/duel/state'), { headers }).catch(() => null);

  // If the state isn't available, we intentionally do NOT auto-initialize here.
  // Practice should be started by the Discord command to keep flows consistent.
  if (!res || !res.ok) {
    const peek = res && (await res.text().catch(() => '')) || '';
    console.error('❌ Practice load failed:', peek.slice(0, 200));
    return;
  }

  const data = normalizeServerState(await res.json().catch(() => null));
  if (!data) {
    console.error('❌ Invalid duel state payload');
    return;
  }

  // Hydrate UI state but DO NOT start or render yet — Start button/coin flip owns the reveal.
  Object.assign(duelState, data);
  duelState.started = false; // gate UI until the user presses "Start Practice Duel"
  try { document.body.classList.remove('duel-ready'); } catch {}
  console.log('[duelLoader] Practice state hydrated; waiting for Start button to run coin flip.');
}

async function loadPvp(p1, p2) {
  // Optionally include requester token for auditing/ownership (server may ignore)
  const body = { player1Id: p1, player2Id: p2 };
  if (TOKEN) body.requesterToken = TOKEN;

  const res = await fetch(apiUrl('/duel/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'X-Player-Token': TOKEN } : {}) },
    body: JSON.stringify(body)
  }).catch(() => null);

  if (!res || !res.ok) {
    const msg = res ? await res.text().catch(() => '') : 'no response';
    console.error('❌ Duel load failed:', msg);
    alert('Failed to load duel. Make sure both players saved/linked decks.');
    return;
  }

  const data = normalizeServerState(await res.json().catch(() => null));
  if (!data) {
    console.error('❌ Invalid duel state payload');
    return;
  }

  Object.assign(duelState, data);

  // PvP links still auto-render (no Start button flow here)
  renderDuelUI();
}

// Auto-run based on query params
(async function main() {
  try {
    if (player1Id && player2Id) {
      // PvP flow from Discord invite link: /?player1=...&player2=...
      await loadPvp(player1Id, player2Id);
    } else if (mode === 'practice') {
      // Practice flow from /practice button: Discord already called /bot/practice
      await loadPractice();
    } else {
      // No-op: page can still be used in "mock" mode via other scripts/controls
      console.log('[duelLoader] No PvP/practice params present; loader idle.');
    }
  } catch (e) {
    console.error('❌ duelLoader fatal error:', e);
  }
})();
