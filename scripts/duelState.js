// scripts/duelState.js

import { renderDuelUI } from './renderDuelUI.js';
import { apiUrl } from './config.js';

// ------------------------------
// Constants + small helpers
// ------------------------------
const MAX_FIELD_SLOTS = 3;
const MAX_HAND = 4;

function pad3(v) { return String(v).padStart(3, '0'); }
function asId(v) {
  const n = Number(String(v).replace(/\D/g, ''));
  return Number.isFinite(n) ? pad3(n) : pad3(v || '000');
}
// A lightweight trap heuristic (kept consistent with UI): id range 106–120
function isTrapIdByRange(idish) {
  const n = Number(asId(idish));
  return n >= 106 && n <= 120;
}
function toEntry(objOrId) {
  if (objOrId && typeof objOrId === 'object') {
    const cid = asId(objOrId.cardId ?? objOrId.id ?? objOrId.card_id);
    return {
      cardId: cid,
      isFaceDown: Boolean(objOrId.isFaceDown),
      _fired: Boolean(objOrId._fired),
    };
  }
  return { cardId: asId(objOrId), isFaceDown: false, _fired: false };
}

function safeRender() {
  try { renderDuelUI(); } catch {}
}

function ensurePlayerShape(p) {
  if (!p || typeof p !== 'object') return;
  p.hand        ||= [];
  p.field       ||= [];
  p.deck        ||= [];
  p.discardPile ||= [];
  p.buffs       ||= {}; // bag for per-turn flags: skipNextDraw, skipNextTurn, extraDrawPerTurn, blockHealTurns, etc.
}

// The single source of truth for the UI
export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [], buffs: {}, discordName: 'You',          name: 'You' },
    player2: { hp: 200, hand: [], field: [], deck: [], discardPile: [], buffs: {}, discordName: 'Practice Bot', name: 'Practice Bot' }
  },
  lootPile: [],
  currentPlayer: 'player1',
  winner: null,
  summarySaved: false,

  // 🔒 UI gates & turn-start bookkeeping
  started: false, // becomes true after coin flip completes
  _startDrawDoneFor: { player1: false, player2: false }, // duel.js uses this to avoid double start-draws
};

// ------------------------------
// Normalization
// ------------------------------
function normalizeServerState(data) {
  if (!data || typeof data !== 'object') return null;

  // Some backends expose a "bot" key; normalize to player2
  if (data?.players?.bot && !data.players.player2) {
    data.players.player2 = data.players.bot;
    delete data.players.bot;
  }
  if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

  // Ensure required containers exist
  data.players ??= {};
  data.players.player1 ??= {};
  data.players.player2 ??= {};

  // Arrays / hp / buffs safety
  for (const key of ['hand','field','deck','discardPile']) {
    data.players.player1[key] ??= [];
    data.players.player2[key] ??= [];
  }
  data.players.player1.hp ??= 200;
  data.players.player2.hp ??= 200;

  ensurePlayerShape(data.players.player1);
  ensurePlayerShape(data.players.player2);

  // 🔒 Preserve previously known display names if new payload is missing them
  const prevP1 = duelState?.players?.player1 || {};
  const prevP2 = duelState?.players?.player2 || {};

  const incomingP1Name =
    data.players.player1.discordName ||
    data.players.player1.name ||
    prevP1.discordName ||
    prevP1.name ||
    'You';

  const incomingP2Name =
    data.players.player2.discordName ||
    data.players.player2.name ||
    prevP2.discordName ||
    prevP2.name ||
    'Practice Bot';

  // Apply names consistently on both props so any UI using either is safe
  data.players.player1.discordName = incomingP1Name;
  data.players.player1.name        = incomingP1Name;

  data.players.player2.discordName = incomingP2Name;
  data.players.player2.name        = incomingP2Name;

  // Preserve/initialize UI flags if not present in payload
  if (typeof data.started !== 'boolean') data.started = duelState.started || false;
  if (!data._startDrawDoneFor) data._startDrawDoneFor = { player1: false, player2: false };

  return data;
}

// ------------------------------
// Server-backed initializers
// ------------------------------

// PvP: request server to start a duel from linked decks
export async function initializeLiveDuel(player1Id, player2Id) {
  try {
    const res = await fetch(apiUrl('/duel/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id, player2Id }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const duelData = normalizeServerState(await res.json());
    if (!duelData) throw new Error('Invalid duel payload');
    Object.assign(duelState, duelData);
    console.log('✅ Loaded linked decks for live duel.');
    safeRender();
  } catch (err) {
    console.error('❌ Failed to load linked decks:', err);
  }
}

// Practice: pull current server state (Discord /practice already initialized it)
export async function hydrateFromServer() {
  try {
    const res = await fetch(apiUrl('/duel/state'));
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const duelData = normalizeServerState(await res.json());
    if (!duelData) throw new Error('Invalid duel payload');
    Object.assign(duelState, duelData);
    console.log('✅ Hydrated duel state from server.');
    safeRender();
    return true;
  } catch (err) {
    console.warn('⚠️ hydrateFromServer failed:', err?.message || err);
    return false;
  }
}

// ------------------------------
// Local-only practice (legacy / mock)
// ------------------------------
export function initializePracticeDuel() {
  const getRandomCards = () => {
    const ids = new Set();
    while (ids.size < 20) {
      const id = String(Math.floor(Math.random() * 127) + 1).padStart(3, '0');
      ids.add(id);
    }
    return Array.from(ids).map(cardId => ({ cardId, isFaceDown: false }));
  };

  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [], buffs: {}, discordName: 'You',          name: 'You' },
    player2: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [], buffs: {}, discordName: 'Practice Bot', name: 'Practice Bot' },
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;

  // Reset UI flags for a clean start
  duelState.started = false;
  duelState._startDrawDoneFor = { player1: false, player2: false };

  console.log('🧪 Practice duel initialized locally with random cards.');
  safeRender();
}

// ------------------------------
// Basic UI-only helpers
// (Kept for legacy/local flows; server-driven flows should use duel.js)
// ------------------------------
export function drawCard(player) {
  const p = duelState.players[player];
  if (!p || p.hand.length >= MAX_HAND || p.deck.length === 0) return;
  // normalize deck top to an entry
  const top = toEntry(p.deck.shift());
  // hands are face-up; hide only when rendered for opponent
  top.isFaceDown = false;
  p.hand.push(top);
  safeRender();
}

export function playCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index] || p.field.length >= MAX_FIELD_SLOTS) return;

  // Normalize card and enforce trap facedown on entry
  const entry = toEntry(p.hand.splice(index, 1)[0]);
  if (isTrapIdByRange(entry.cardId) && !entry._fired) {
    entry.isFaceDown = true;
  } else {
    entry.isFaceDown = false;
  }

  p.field.push(entry);
  safeRender();
}

export function discardCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index]) return;
  const card = toEntry(p.hand.splice(index, 1)[0]);
  p.discardPile.push(card);
  safeRender();
}

export function endTurn() {
  duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'player2' : 'player1';
  // Reset the start-of-turn draw flags so the new active can auto-draw (duel.js will consume this)
  duelState._startDrawDoneFor = { player1: false, player2: false };
  safeRender();
}

export function updateHP(player, amount) {
  const p = duelState.players[player];
  p.hp += amount;
  if (p.hp <= 0) {
    p.hp = 0;
    duelState.winner = player === 'player1' ? 'player2' : 'player1';
  }
  safeRender();
}
