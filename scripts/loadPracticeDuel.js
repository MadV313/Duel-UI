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
function setDuelReady(flag) { try { document.body.classList.toggle('duel-ready', !!flag); } catch {} }

const MAX_HP = 200;

/* ---------- token discovery & persistence (new) ---------- */
let PLAYER_TOKEN = '';
try {
  const qs = new URLSearchParams(location.search);
  PLAYER_TOKEN = qs.get('token') || localStorage.getItem('sv13.token') || '';
  if (PLAYER_TOKEN) localStorage.setItem('sv13.token', PLAYER_TOKEN);
} catch { /* ignore */ }

/* ---------- tiny normalizers (mirror renderDuelUI) ---------- */
const pad3 = id => String(id).padStart(3, '0');

function getMeta(cardId) {
  try {
    // optional cache if you’ve exposed it elsewhere; safe if missing
    // eslint-disable-next-line no-undef
    const allCards = window.__ALL_CARDS__ || null;
    if (!allCards) return null;
    return allCards.find(c => c.card_id === pad3(cardId));
  } catch { return null; }
}

function hasTag(meta, t) {
  if (!meta) return false;
  const arr = Array.isArray(meta.tags)
    ? meta.tags.map(x => String(x).toLowerCase().trim())
    : String(meta.tags || '').split(',').map(x => x.toLowerCase().trim()).filter(Boolean);
  return arr.includes(String(t).toLowerCase());
}

function isTrap(cardId, maybeMeta) {
  const m = maybeMeta || getMeta(cardId);
  const type = String(m?.type || '').toLowerCase();
  return type === 'trap' || hasTag(m, 'trap');
}

function toEntry(objOrId, defaultFaceDown = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return { cardId: pad3(cid), isFaceDown: objOrId.isFaceDown ?? defaultFaceDown };
  }
  return { cardId: pad3(objOrId), isFaceDown: defaultFaceDown };
}

function toFieldEntry(objOrId) {
  const e = toEntry(objOrId, false);
  // UI guarantee: traps face-down, everything else up
  e.isFaceDown = isTrap(e.cardId) ? true : false;
  return e;
}

/* ---------------- UI gating helpers ---------------- */
function hideZonesAndControlsExceptStart() {
  hide($('player1-hand'));
  hide($('player2-hand'));
  hide($('player1-field'));
  hide($('player2-field'));

  const controls = document.querySelectorAll('#controls button');
  controls.forEach(btn => { if (btn && btn.id !== 'startPracticeBtn') hide(btn); });

  // CSS gate OFF until flip finishes
  setDuelReady(false);

  // keep the turn banner hidden until after the flip
  const turn = $('turn-display');
  if (turn) { turn.classList.add('hidden'); turn.style.display = 'none'; }
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

/* ---------------- main ---------------- */
export async function loadPracticeDuel() {
  // Hard gate: mark duel as not started so other renderers/bot logic ignore it
  duelState.started = false;

  // 0) Immediately ensure only the Start button is visible
  hideZonesAndControlsExceptStart();

  let data;

  // 1) Ask backend to (re)initialize a practice duel
  try {
    const url = `${API_BASE}/bot/practice`;
    console.log('[practice] fetch →', url);

    // Attach token header if we have it (fetch-shim also does this, but we add here defensively)
    const headers = PLAYER_TOKEN ? { 'X-Player-Token': PLAYER_TOKEN } : undefined;

    const res = await fetch(url, { method: 'GET', headers });
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
    data.players.player1 = data.players.player1 || { hp: MAX_HP, hand: [], field: [], deck: [], discardPile: [] };
    data.players.player2 = data.players.player2 || { hp: MAX_HP, hand: [], field: [], deck: [], discardPile: [] };

    data.players.player1.discordName = p1Name;
    data.players.player2.discordName = p2Name;
    try { document.title = `Duel Field — ${p1Name} vs ${p2Name}`; } catch {}
  } catch (e) {
    console.warn('[practice] name injection warning:', e);
  }

  // 4) Normalize hands/fields/decks to consistent entry objects
  try {
    const p1 = data.players.player1;
    const p2 = data.players.player2;

    // Clamp HP friendly
    p1.hp = Math.max(0, Math.min(MAX_HP, Number(p1.hp ?? MAX_HP)));
    p2.hp = Math.max(0, Math.min(MAX_HP, Number(p2.hp ?? MAX_HP)));

    p1.hand        = Array.isArray(p1.hand)        ? p1.hand.map(e => toEntry(e, false)) : [];
    p1.field       = Array.isArray(p1.field)       ? p1.field.map(toFieldEntry)          : [];
    p1.deck        = Array.isArray(p1.deck)        ? p1.deck.map(e => toEntry(e, false)) : [];
    p1.discardPile = Array.isArray(p1.discardPile) ? p1.discardPile.map(toEntry)         : [];

    // Opponent hand should be face-down visually until played
    p2.hand        = Array.isArray(p2.hand)        ? p2.hand.map(e => toEntry(e, true))  : [];
    p2.field       = Array.isArray(p2.field)       ? p2.field.map(toFieldEntry)          : [];
    p2.deck        = Array.isArray(p2.deck)        ? p2.deck.map(e => toEntry(e, false)) : [];
    p2.discardPile = Array.isArray(p2.discardPile) ? p2.discardPile.map(toEntry)         : [];
  } catch (e) {
    console.warn('[practice] normalization warning:', e);
  }

  // 5) Merge into UI state (but still keep zones hidden & not started)
  Object.assign(duelState, data);

  // 6) Coin flip FIRST — await the animation promise so we only reveal after toast
  try {
    await flipCoin(duelState.currentPlayer, { animate: true, duration: 2800, announce: true });
  } catch (e) {
    console.warn('coinFlip animation issue (non-fatal):', e);
  }

  // Mark duel as started only AFTER the coin flip finishes
  duelState.started = true;

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
