// scripts/duelState.js

import { renderDuelUI } from './renderDuelUI.js';
import { apiUrl } from './config.js';

// The single source of truth for the UI
export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [], discordName: 'You' },
    player2: { hp: 200, hand: [], field: [], deck: [], discardPile: [], discordName: 'Practice Bot' }
  },
  lootPile: [],
  currentPlayer: 'player1',
  winner: null,
  summarySaved: false,
};

// ------------------------------
// Helpers
// ------------------------------
function safeRender() {
  try { renderDuelUI(); } catch {}
}

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
  for (const key of ['hand','field','deck','discardPile']) {
    data.players.player1[key] ??= [];
    data.players.player2[key] ??= [];
  }
  data.players.player1.hp ??= 200;
  data.players.player2.hp ??= 200;

  // Friendly labels if missing
  data.players.player1.discordName ||= data.players.player1.discordName || 'You';
  data.players.player2.discordName ||= data.players.player2.discordName || 'Practice Bot';

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
    player1: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [], discordName: 'You' },
    player2: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [], discordName: 'Practice Bot' },
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;

  console.log('🧪 Practice duel initialized locally with random cards.');
  safeRender();
}

// ------------------------------
// Basic UI-only helpers
// ------------------------------
export function drawCard(player) {
  const p = duelState.players[player];
  if (!p || p.hand.length >= 4 || p.deck.length === 0) return;
  p.hand.push(p.deck.shift());
  safeRender();
}

export function playCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index] || p.field.length >= 4) return;
  p.field.push(p.hand.splice(index, 1)[0]);
  safeRender();
}

export function discardCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index]) return;
  const card = p.hand.splice(index, 1)[0];
  p.discardPile.push(card);
  safeRender();
}

export function endTurn() {
  duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'player2' : 'player1';
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
