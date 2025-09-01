// scripts/duelLoader.js
// Auto-start loader for duels launched from Discord links (PvP or Practice)

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { apiUrl } from './config.js';

const qs = new URLSearchParams(location.search);
const mode       = qs.get('mode');          // e.g. "practice"
const player1Id  = qs.get('player1');
const player2Id  = qs.get('player2') || 'bot';

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
  // Try to read existing state first (Discord command already initialized it)
  let res = await fetch(apiUrl('/duel/state')).catch(() => null);

  // If the state isn't available, you can optionally try to initialize here
  if (!res || !res.ok) {
    // Optional: start a new practice duel from the UI if none exists
    // (Left commented to keep Discord as the initializer)
/*
    await fetch(apiUrl('/duel/practice')).catch(() => null);
    res = await fetch(apiUrl('/duel/state')).catch(() => null);
*/
  }

  if (!res || !res.ok) {
    console.error('❌ Practice load failed:', res && (await res.text()).slice(0, 200));
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
  const res = await fetch(apiUrl('/duel/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1Id: p1, player2Id: p2 })
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
