// scripts/loadPracticeDuel.js
// Start practice flow so that NOTHING renders until after the coin flip.
// ✨ Call this from the Start button only; do NOT call flipCoin separately.

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { flipCoin } from './coinFlip.js';
import { API_BASE } from './config.js';

function $(id) { return document.getElementById(id); }
function hide(el) { if (el) el.style.display = 'none'; }
function show(el, disp) { if (el) el.style.display = disp; }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function setDuelReady(flag) {
  try { document.body.classList.toggle('duel-ready', !!flag); } catch {}
}

function hideZonesAndControlsExceptStart() {
  hide($('player1-hand'));
  hide($('player2-hand'));
  hide($('player1-field'));
  hide($('player2-field'));

  const controls = document.querySelectorAll('#controls button');
  controls.forEach(btn => { if (btn && btn.id !== 'startPracticeBtn') hide(btn); });

  // CSS gate as well (keeps everything hidden until we flip)
  setDuelReady(false);

  // keep the turn banner hidden until after the flip
  const turn = $('turn-display');
  if (turn) turn.classList.add('hidden');
}

function showZonesAndControls() {
  show($('player1-hand'), 'flex');
  show($('player2-hand'), 'flex');
  show($('player1-field'), 'grid');
  show($('player2-field'), 'grid');

  const controls = document.querySelectorAll('#controls button');
  controls.forEach(btn => { if (btn && btn.id !== 'startPracticeBtn') show(btn, 'inline-block'); });

  // Let CSS reveal the rest and auto-hide Start
  setDuelReady(true);
}

export async function loadPracticeDuel() {
  // 0) Immediately ensure only the Start button is visible
  hideZonesAndControlsExceptStart();

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

  // 2.1) Ensure mode for later bot turns
  data.mode = data.mode || 'practice';

  // 3) Inject/derive display names (so the top-left shows YOUR name)
  try {
    const qs = new URLSearchParams(location.search);
    const fromQuery = qs.get('user') || qs.get('name') || null;

    const fromStorage = localStorage.getItem('DUEL_PLAYER_NAME');
    const backendP1   = data?.players?.player1?.discordName || data?.players?.player1?.name;
    const backendP2   = data?.players?.player2?.discordName || data?.players?.player2?.name;

    const p1Name = (fromQuery || fromStorage || backendP1 || 'Player 1').toString();
    const p2Name = (backendP2 || 'Practice Bot').toString();

    if (fromQuery) localStorage.setItem('DUEL_PLAYER_NAME', p1Name);

    data.players = data.players || {};
    data.players.player1 = data.players.player1 || { hp: 200, hand: [], field: [], deck: [], discardPile: [] };
    data.players.player2 = data.players.player2 || { hp: 200, hand: [], field: [], deck: [], discardPile: [] };

    data.players.player1.discordName = p1Name;
    data.players.player2.discordName = p2Name;
    try { document.title = `Duel Field — ${p1Name} vs ${p2Name}`; } catch {}
  } catch (e) {
    console.warn('[practice] name injection warning:', e);
  }

  // 4) Mask opponent hand as FACE-DOWN until played
  try {
    const opp = data?.players?.player2;
    if (opp && Array.isArray(opp.hand)) {
      opp.hand = opp.hand.map(entry => {
        if (entry && typeof entry === 'object') {
          return { ...entry, cardId: String(entry.cardId ?? entry.id ?? entry.card_id ?? '000').padStart(3,'0'), isFaceDown: true };
        }
        return { cardId: String(entry ?? '000').padStart(3,'0'), isFaceDown: true };
      });
    }
  } catch (e) {
    console.warn('[practice] mask opponent hand warning:', e);
  }

  // 5) Merge into UI state (but still keep zones hidden)
  Object.assign(duelState, data);

  // 6) Coin flip FIRST — make sure we DON'T reveal zones until after toast vanishes
  const flipDuration = 2800; // matches coinFlip default-ish but a touch longer
  try {
    // Note: flipCoin is not Promise-based, so we explicitly wait the duration.
    flipCoin(duelState.currentPlayer, { duration: flipDuration });
    await sleep(flipDuration + 100); // small buffer so the overlay fully hides
  } catch (e) {
    console.warn('coinFlip animation issue (non-fatal):', e);
  }

  // 7) Now reveal zones and render the "dealt" state
  const s = $('startPracticeBtn');
  if (s) {
    s.disabled = true;
    s.textContent = '✅ Practice Ready';
    hide(s);
  }

  showZonesAndControls();

  // Render zones/UI (backend already drew 3 each — don’t draw here)
  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');
  renderDuelUI();

  return true;
}
