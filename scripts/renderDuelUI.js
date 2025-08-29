// scripts/renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import { API_BASE, UI_BASE } from './config.js';
import allCards from './allCards.js';

const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';

// Prevent double-sending bot turns if render fires rapidly
let botTurnInFlight = false;

// UI-enforced limits (keeps display sane even if backend misbehaves)
const MAX_FIELD_SLOTS = 3;
const MAX_HP = 200;

/* ------------------ small helpers ------------------ */
function getMeta(cardId) {
  const id = String(cardId).padStart(3, '0');
  return allCards.find(c => c.card_id === id);
}
function isTrap(cardId) {
  const t = String(getMeta(cardId)?.type || '').toLowerCase();
  return t === 'trap';
}

/* ------------------ display helpers ------------------ */
function nameOf(playerKey) {
  const p = duelState?.players?.[playerKey] || {};
  return p.discordName || p.name || (playerKey === 'player2' ? 'Practice Bot' : 'Player 1');
}

function setTurnText() {
  const el = document.getElementById('turn-display');
  if (!el) return;

  // If an inline style hid this at load time, clear it now so it can show
  el.style.display = '';

  if (duelState.winner) {
    el.textContent = `Winner: ${duelState.winner} (${nameOf(duelState.winner)})`;
    el.classList.remove('hidden');
    return;
  }

  const who = duelState.currentPlayer;
  const label = who === 'player1' ? 'Challenger' : 'Opponent';
  el.textContent = `Turn: ${label} — ${nameOf(who)}`;
  el.classList.remove('hidden');
}

function setHpText() {
  const p1hpEl = document.getElementById('player1-hp');
  const p2hpEl = document.getElementById('player2-hp');
  if (p1hpEl) p1hpEl.textContent = duelState.players.player1.hp;
  if (p2hpEl) p2hpEl.textContent = duelState.players.player2.hp;

  // also refresh the labels with names (keeps your existing markup)
  const hpWrap = document.getElementById('hp-display');
  try {
    const rows = hpWrap?.querySelectorAll('div');
    if (rows && rows[0]) {
      rows[0].innerHTML = `Challenger (${nameOf('player1')}) HP: <span id="player1-hp">${duelState.players.player1.hp}</span>`;
    }
    if (rows && rows[1]) {
      rows[1].innerHTML = `Opponent (${nameOf('player2')}) HP: <span id="player2-hp">${duelState.players.player2.hp}</span>`;
    }
  } catch {}
}

/* ------------------ state normalizers ------------------ */
function asIdString(id) {
  return String(id).padStart(3, '0');
}

function toEntry(objOrId, defaultFaceDown = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return { cardId: asIdString(cid), isFaceDown: Boolean(objOrId.isFaceDown ?? defaultFaceDown) };
  }
  return { cardId: asIdString(objOrId), isFaceDown: Boolean(defaultFaceDown) };
}

// Field entries: non-traps must be face-UP; traps face-DOWN (UI guarantee)
function toFieldEntry(objOrId) {
  const base = toEntry(objOrId, false);
  base.isFaceDown = isTrap(base.cardId) ? true : false;
  return base;
}

function normalizePlayerForServer(p) {
  if (!p) return { hp: 200, hand: [], field: [], deck: [], discardPile: [] };
  return {
    hp: Number(p.hp ?? 200),
    hand: Array.isArray(p.hand) ? p.hand.map(e => toEntry(e, false)) : [],
    field: Array.isArray(p.field) ? p.field.map(e => toEntry(e, false)) : [],
    deck: Array.isArray(p.deck) ? p.deck.map(e => toEntry(e, false)) : [],
    discardPile: Array.isArray(p.discardPile) ? p.discardPile.map(e => toEntry(e, false)) : [],
    discordName: p.discordName || p.name || undefined,
    name: p.name || undefined,
  };
}

// Map UI state (player2) -> backend expectation (bot)
function normalizeStateForServer(state) {
  // Clamp fields before sending (prevents backend from getting >3 UI-induced)
  clampFields(state);

  return {
    mode: state.mode || 'practice',
    currentPlayer: state.currentPlayer === 'player2' ? 'bot' : state.currentPlayer,
    players: {
      player1: normalizePlayerForServer(state?.players?.player1),
      bot:     normalizePlayerForServer(state?.players?.player2),
    }
  };
}

// Merge backend reply (possibly using players.bot/currentPlayer=bot) back into UI duelState
function mergeServerIntoUI(server) {
  if (!server || typeof server !== 'object') return;

  const next = typeof structuredClone === 'function'
    ? structuredClone(server)
    : JSON.parse(JSON.stringify(server));

  // Convert bot key back to player2
  if (next?.players?.bot) {
    next.players.player2 = next.players.bot;
    delete next.players.bot;
  }

  if (next?.currentPlayer === 'bot') next.currentPlayer = 'player2';

  // Ensure all arrays are normalized entries for consistency
  ['player1','player2'].forEach(pk => {
    const P = next?.players?.[pk];
    if (!P) return;

    // Clamp HP in a friendly way (UI-side safety)
    P.hp = Math.max(0, Math.min(MAX_HP, Number(P.hp ?? MAX_HP)));

    P.hand = Array.isArray(P.hand) ? P.hand.map(e => toEntry(e, pk === 'player2')) : [];
    // Force non-traps face-up on field; traps face-down
    P.field = Array.isArray(P.field) ? P.field.map(toFieldEntry) : [];
    P.deck = Array.isArray(P.deck) ? P.deck.map(e => toEntry(e, false)) : [];
    P.discardPile = Array.isArray(P.discardPile) ? P.discardPile.map(e => toEntry(e, false)) : [];

    // Mask opponent hand to face-down for player view (visual only)
    if (pk === 'player2') {
      P.hand = P.hand.map(e => ({ ...e, isFaceDown: true }));
    }
  });

  // Enforce UI caps (don’t let >3 render)
  clampFields(next);

  Object.assign(duelState, next);
}

/* --------------- UI safety clamps (display only) --------------- */
function ensureArrays(p) {
  p.hand ||= [];
  p.field ||= [];
  p.deck ||= [];
  p.discardPile ||= [];
}

function clampFields(state) {
  try {
    ['player1', 'player2'].forEach(pk => {
      const p = state?.players?.[pk];
      if (!p) return;
      ensureArrays(p);

      // If field exceeds limit, move extras to discard (display safeguard)
      if (Array.isArray(p.field) && p.field.length > MAX_FIELD_SLOTS) {
        const extras = p.field.splice(MAX_FIELD_SLOTS); // remove beyond slots
        p.discardPile.push(...extras);
        console.warn(`[UI] Field overflow (${pk}) — moved ${extras.length} card(s) to discard for display cap.`);
      }
    });
  } catch {}
}

/* ----------------- render helpers ----------------- */
function renderZones() {
  // You: visible; Opponent: renderHand will auto-face-down in player view
  renderHand('player1', isSpectator);
  renderHand('player2', isSpectator);
  renderField('player1', isSpectator);
  renderField('player2', isSpectator);
}

/* ---------------- fetch helpers (bot) ---------------- */
async function postBotTurn(payload) {
  // Try /bot/turn first (your recent logs use this), then gracefully fall back to /duel/turn
  let res = await fetch(`${API_BASE}/bot/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 404 || res.status === 405) {
    // fallback route name used in some earlier builds
    res = await fetch(`${API_BASE}/duel/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  return res;
}

/* ---------------- bot turn driver ----------------- */
async function maybeRunBotTurn() {
  if (botTurnInFlight) return;
  if (isSpectator) return;
  if (duelState.currentPlayer !== 'player2') return; // only when it's actually bot's turn

  botTurnInFlight = true;
  try {
    const payload = normalizeStateForServer(duelState);

    // Debug breadcrumb (minimal/non-sensitive)
    try {
      console.log('[UI→Bot] payload', {
        mode: payload.mode,
        currentPlayer: payload.currentPlayer,
        p1: { hp: payload.players.player1.hp, hand: payload.players.player1.hand.length, field: payload.players.player1.field.length, deck: payload.players.player1.deck.length },
        bot: { hp: payload.players.bot.hp, hand: payload.players.bot.hand.length, field: payload.players.bot.field.length, deck: payload.players.bot.deck.length },
      });
    } catch {}

    const res = await postBotTurn(payload);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[UI] Bot move failed:', res.status, txt);
      return;
    }

    const updated = await res.json().catch(() => null);
    if (updated) {
      mergeServerIntoUI(updated);
    }
  } catch (err) {
    console.error('[UI] Bot move error:', err);
  } finally {
    botTurnInFlight = false;
    // Re-render after bot move (or failure) to keep UI fresh
    setHpText();
    setTurnText();
    renderZones();
  }
}

/* ------------------ main render ------------------ */
export function renderDuelUI() {
  // Ensure zones/buttons are allowed to show (CSS gate)
  document.body.classList.add('duel-ready');

  // Defensive clamp before any draw
  clampFields(duelState);

  renderZones();
  setHpText();
  setTurnText();

  // If duel is over, save summary (non-spectator) and redirect
  if (duelState.winner) {
    if (!duelState.summarySaved && !isSpectator) {
      const duelId = `duel_${Date.now()}`;
      const summary = {
        duelId,
        winner: duelState.winner,
        hp: {
          player1: duelState.players.player1.hp,
          player2: duelState.players.player2.hp,
        },
        cards: {
          player1: {
            field: duelState.players.player1.field.length,
            hand: duelState.players.player1.hand.length,
            deck: duelState.players.player1.deck.length,
            discard: duelState.players.player1.discardPile.length,
          },
          player2: {
            field: duelState.players.player2.field.length,
            hand: duelState.players.player2.hand.length,
            deck: duelState.players.player2.deck.length,
            discard: duelState.players.player2.discardPile.length,
          },
        },
      };

      duelState.summarySaved = true;

      fetch(`${API_BASE}/summary/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      })
        .catch(err => console.error('[UI] Summary save failed:', err))
        .finally(() => {
          window.location.href = `${UI_BASE}/summary.html?duelId=${duelId}`;
        });
    }
    return;
  }

  // Kick the bot if it's their turn
  if (duelState.currentPlayer === 'player2') {
    void maybeRunBotTurn();
  }
}
