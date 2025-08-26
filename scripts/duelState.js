// duelState.js

import { renderDuelUI } from './renderDuelUI.js';
import { API_BASE } from './config.js';

export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    player2: { hp: 200, hand: [], field: [], deck: [], discardPile: [] }
  },
  lootPile: [],
  currentPlayer: 'player1',
  winner: null,
  summarySaved: false
};

// ✅ Live duel loading from backend (PvP)
export async function initializeLiveDuel(player1Id, player2Id) {
  try {
    const res = await fetch(`${API_BASE}/duel/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Id, player2Id })
    });
    const duelData = await res.json();
    Object.assign(duelState, duelData);
    console.log("✅ Loaded linked decks for live duel.");
  } catch (err) {
    console.error("❌ Failed to load linked decks:", err);
  }
}

// ✅ Practice mode (legacy local generator if you ever need it)
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
    player1: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [] },
    player2: { hp: 200, hand: [], field: [], deck: getRandomCards(), discardPile: [] }
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;

  console.log("🧪 Practice duel initialized with random card objects.");
  renderDuelUI();
}

// Basic UI helpers (kept for completeness)
export function drawCard(player) {
  const p = duelState.players[player];
  if (!p || p.hand.length >= 4 || p.deck.length === 0) return;
  p.hand.push(p.deck.shift());
  renderDuelUI();
}
export function playCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index] || p.field.length >= 4) return;
  p.field.push(p.hand.splice(index, 1)[0]);
  renderDuelUI();
}
export function discardCard(player, index) {
  const p = duelState.players[player];
  if (!p || !p.hand[index]) return;
  const card = p.hand.splice(index, 1)[0];
  p.discardPile.push(card);
  renderDuelUI();
}
export function endTurn() {
  duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'player2' : 'player1';
  renderDuelUI();
}
export function updateHP(player, amount) {
  const p = duelState.players[player];
  p.hp += amount;
  if (p.hp <= 0) {
    p.hp = 0;
    duelState.winner = player === 'player1' ? 'player2' : 'player1';
  }
  renderDuelUI();
}
