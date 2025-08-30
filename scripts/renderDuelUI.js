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
const MAX_HAND = 4;

/* ------------------ small helpers ------------------ */
function pad3(id) { return String(id).padStart(3, '0'); }

function getMeta(cardId) {
  const id = pad3(cardId);
  return allCards.find(c => c.card_id === id);
}
function isTrap(cardId) {
  const t = String(getMeta(cardId)?.type || '').toLowerCase();
  return t === 'trap';
}
function hasTag(meta, ...tags) {
  if (!meta) return false;
  const arr = Array.isArray(meta.tags)
    ? meta.tags.map(t => String(t).toLowerCase().trim())
    : String(meta.tags || '')
        .split(',')
        .map(t => t.toLowerCase().trim())
        .filter(Boolean);
  return tags.some(t => arr.includes(t));
}
function looksInfected(meta) {
  if (!meta) return false;
  if (hasTag(meta, 'infected')) return true;
  return /infected/i.test(String(meta.name || ''));
}
function ensureArrays(p) {
  p.hand ||= [];
  p.field ||= [];
  p.deck ||= [];
  p.discardPile ||= [];
}
function changeHP(playerKey, delta) {
  const p = duelState?.players?.[playerKey];
  if (!p) return;
  const next = Math.max(0, Math.min(MAX_HP, Number(p.hp ?? MAX_HP) + Number(delta)));
  p.hp = next;
}
function drawFor(playerKey) {
  const P = duelState?.players?.[playerKey];
  if (!P) return false;
  ensureArrays(P);
  if (P.hand.length >= MAX_HAND) return false;
  if (P.deck.length === 0) return false;
  const top = P.deck.shift();
  const entry = toEntry(top, playerKey === 'player2'); // bot hand is face-down visually
  P.hand.push(entry);
  return true;
}

/* ---------------- discard / resolve helpers ---------------- */
function shouldAutoDiscard(meta) {
  if (!meta) return false;

  const tags = (Array.isArray(meta.tags) ? meta.tags
              : String(meta.tags || '').split(',').map(s => s.trim().toLowerCase())).filter(Boolean);

  if (tags.includes('discard_after_use') || tags.includes('consumable') || tags.includes('one_use')) return true;

  const effect = String(meta.effect || '').toLowerCase();
  const patterns = [
    /discard\s+this\s+card\s+(?:after|upon)\s+use/,
    /discard\s+after\s+use/,
    /use:\s*discard\s+this\s+card/,
    /then\s+discard\s+this\s+card/
  ];
  return patterns.some(rx => rx.test(effect));
}

function moveFieldCardToDiscard(playerKey, cardObj) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const i = P.field.indexOf(cardObj);
  if (i !== -1) {
    const [c] = P.field.splice(i, 1);
    P.discardPile.push(c);
  }
}

function discardRandomTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const idx = P.field.findIndex(c => c && isTrap(c.cardId));
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
    return true;
  }
  return false;
}

function revealRandomEnemyTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const traps = P.field.filter(c => c && isTrap(c.cardId) && c.isFaceDown);
  if (traps.length) {
    const chosen = traps[Math.floor(Math.random() * traps.length)];
    chosen.isFaceDown = false;
    return true;
  }
  return false;
}

function destroyEnemyInfected(foeKey) {
  const P = duelState.players[foeKey];
  ensureArrays(P);
  const idx = P.field.findIndex(c => {
    const m = getMeta(c.cardId);
    return looksInfected(m);
  });
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
    return true;
  }
  return false;
}

/* -------------- UI-side effect resolver (bot) -------------- */
/**
 * Minimal parser that understands a broader set of phrases that appear in allCards.json.
 * This runs for bot's NON-TRAP face-up cards so their effects are visible immediately.
 */
function resolveImmediateEffect(meta, ownerKey) {
  if (!meta) return;

  const you = ownerKey;                        // 'player2'
  const foe = ownerKey === 'player1' ? 'player2' : 'player1'; // -> 'player1'
  const text = String(meta.effect || '').toLowerCase();

  // --- damage
  const mDmg = text.match(/deal\s+(\d+)\s*dmg/);
  if (mDmg) changeHP(foe, -Number(mDmg[1]));

  // --- heal
  const mHeal = text.match(/heal\s+(\d+)/);
  if (mHeal) changeHP(you, +Number(mHeal[1]));

  // --- draws (supports "draw 1 card", "draw a card", "draw 1 loot card", "draw 2 loot cards")
  const mDraw = text.match(/draw\s+(a|\d+)\s+(?:loot\s+)?card/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
  }

  // --- discard 1 card from owner's hand (not the "discard this card after use" clause)
  if (/\bdiscard\s+1\s+card\b(?!.*after\s+use)/.test(text)) {
    const hand = duelState.players[you].hand;
    if (hand.length) {
      const tossed = hand.pop();
      duelState.players[you].discardPile ||= [];
      duelState.players[you].discardPile.push(tossed);
    }
  }

  // --- skip next draw
  if (/skip\s+next\s+draw/.test(text)) {
    duelState.players[you].skipNextDraw = true;
  }

  // --- destroy/remove enemy field card (various phrasings)
  if (/(?:destroy|remove)\s+(?:1\s+)?enemy(?:\s+field)?\s+card/.test(text)) {
    const foeField = duelState.players[foe].field || [];
    if (foeField.length) {
      const idx = /random/.test(text) ? Math.floor(Math.random() * foeField.length) : 0;
      const [destroyed] = foeField.splice(idx, 1);
      duelState.players[foe].discardPile ||= [];
      duelState.players[foe].discardPile.push(destroyed);
    }
  }

  // --- explicitly target "infected"
  if (/(?:destroy|kill|remove)\s+(?:1\s+)?infected/.test(text)) {
    destroyEnemyInfected(foe);
  }

  // --- disarm/remove trap
  if (/(?:disarm|disable|destroy)\s+(?:an?\s+)?trap/.test(text)) {
    discardRandomTrap(foe);
  }

  // --- reveal a face-down trap
  if (/(?:reveal|expose)\s+(?:an?\s+)?trap/.test(text)) {
    revealRandomEnemyTrap(foe);
  }
}

/** Scan bot field for newly-placed non-traps and resolve them once. */
function resolveBotNonTrapCardsOnce() {
  const bot = duelState?.players?.player2;
  if (!bot || !Array.isArray(bot.field)) return;
  for (const card of bot.field.slice()) {
    // Only resolve if face-up, non-trap, and not already resolved by the UI
    if (card && !card.isFaceDown && !isTrap(card.cardId) && !card._resolvedByUI) {
      const meta = getMeta(card.cardId);
      resolveImmediateEffect(meta, 'player2');

      if (shouldAutoDiscard(meta)) {
        moveFieldCardToDiscard('player2', card);
      } else {
        // tag so we don't re-apply on subsequent re-renders
        card._resolvedByUI = true;
      }
    }
  }
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
function asIdString(id) { return pad3(id); }

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
  if (!p) return { hp: MAX_HP, hand: [], field: [], deck: [], discardPile: [] };
  return {
    hp: Number(p.hp ?? MAX_HP),
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

  // Defensive clamp before any draw / effects
  clampFields(duelState);

  // ⚙️ Resolve any new, face-up bot cards (non-traps) once
  resolveBotNonTrapCardsOnce();

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
