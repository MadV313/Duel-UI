// scripts/loadPracticeDuel.js
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { flipCoin } from './coinFlip.js';
import { API_BASE } from './config.js';

export async function loadPracticeDuel() {
  let data;

  // 1) Ask backend to (re)initialize a practice duel
  try {
    const url = `${API_BASE}/bot/practice`;
    console.log('[practice] fetch →', url);
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Backend not available (${res.status})`);
    data = await res.json();
    console.log('✅ Loaded practice data from backend:', data);
  } catch (err) {
    console.error('❌ Practice init failed:', err);
    alert('Practice server is not available. Check the API URL.');
    return false;
  }

  // 2) Normalize backend → UI shape (bot → player2)
  if (data?.players?.bot && !data.players.player2) {
    data.players.player2 = data.players.bot;
    delete data.players.bot;
  }
  if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

  // 3) Inject/derive display names (so the top-left shows YOUR name)
  try {
    const qs = new URLSearchParams(location.search);
    const fromQuery =
      qs.get('user') ||            // e.g. ?user=madv313
      qs.get('name') ||            // or ?name=madv313
      null;

    const fromStorage = localStorage.getItem('DUEL_PLAYER_NAME');
    const backendP1   = data?.players?.player1?.discordName || data?.players?.player1?.name;
    const backendP2   = data?.players?.player2?.discordName || data?.players?.player2?.name;

    const p1Name = (fromQuery || fromStorage || backendP1 || 'Player 1').toString();
    const p2Name = (backendP2 || 'Practice Bot').toString();

    // Persist name for next time if provided via URL
    if (fromQuery) localStorage.setItem('DUEL_PLAYER_NAME', p1Name);

    // Ensure objects exist then assign names
    data.players = data.players || {};
    data.players.player1 = data.players.player1 || { hp: 200, hand: [], field: [], deck: [], discardPile: [] };
    data.players.player2 = data.players.player2 || { hp: 200, hand: [], field: [], deck: [], discardPile: [] };

    data.players.player1.discordName = p1Name;
    data.players.player2.discordName = p2Name;

    // Nice touch: put it in the document title
    try {
      document.title = `Duel Field — ${p1Name} vs ${p2Name}`;
    } catch {}
  } catch (e) {
    console.warn('[practice] name injection warning:', e);
  }

  // 4) Merge into UI state
  Object.assign(duelState, data);

  // 5) Reveal zones and render (backend already drew 3 each — don’t draw here)
  const sel = (id) => document.getElementById(id);
  const s = sel('startPracticeBtn');
  if (s) { s.disabled = true; s.textContent = '✅ Practice Ready'; }

  const p1h = sel('player1-hand');
  const p2h = sel('player2-hand');
  const p1f = sel('player1-field');
  const p2f = sel('player2-field');

  if (p1h) p1h.style.display = 'flex';
  if (p2h) p2h.style.display = 'flex';
  if (p1f) p1f.style.display = 'grid';
  if (p2f) p2f.style.display = 'grid';

  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');
  renderDuelUI();

  // 6) Play coin flip animation to match backend’s chosen starter
  try {
    await flipCoin(duelState.currentPlayer);
  } catch (e) {
    console.warn('coinFlip animation issue (non-fatal):', e);
  }

  return true;
}
