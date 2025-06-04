// duelState.js

import { renderDuelUI } from './renderDuelUI.js';

export const duelState = {
  players: {
    player1: {
      hp: 200,
      hand: [],
      field: [],
      deck: [],
      discardPile: [],
    },
    player2: {
      hp: 200,
      hand: [],
      field: [],
      deck: [],
      discardPile: [],
    }
  },
  currentPlayer: 'player1',
  winner: null
};

// ✅ Live duel loading from backend
export async function initializeLiveDuel(player1Id, player2Id) {
  try {
    const res = await fetch('https://duel-bot-backend-production.up.railway.app/bot/startDuel', {
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

// ✅ Practice mode: mock card objects
export function initializePracticeDuel() {
  const getRandomCards = () => {
    const ids = new Set();
    while (ids.size < 20) {
      const id = String(Math.floor(Math.random() * 127) + 1).padStart(3, '0');
      ids.add(id);
    }
    return Array.from(ids).map(cardId => ({
      cardId,
      isFaceDown: false
    }));
  };

  duelState.players = {
    player1: {
      hp: 200,
      hand: [],
      field: [],
      deck: getRandomCards(),
      discardPile: []
    },
    player2: {
      hp: 200,
      hand: [],
      field: [],
      deck: getRandomCards(),
      discardPile: []
    }
  };

  duelState.currentPlayer = 'player1';
  duelState.winner = null;

  console.log("🧪 Practice duel initialized with random card objects.");
}

// 👇 These are UI-linked helpers

export function drawCard(player) {
  const p = duelState.players[player];
  if (p.deck.length === 0 || p.hand.length >= 4) return;
  const card = p.deck.shift();
  p.hand.push(card);
  renderDuelUI();
}

export function playCard(player, cardIndex) {
  const p = duelState.players[player];
  if (p.field.length >= 4 || cardIndex < 0 || cardIndex >= p.hand.length) return;
  const card = p.hand.splice(cardIndex, 1)[0];
  p.field.push(card);
  renderDuelUI();
}

export function discardCard(player, cardIndex) {
  const p = duelState.players[player];
  if (cardIndex < 0 || cardIndex >= p.hand.length) return;
  const card = p.hand.splice(cardIndex, 1)[0];
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
    alert(`${duelState.winner} wins!`);
    // TODO: Trigger summary UI transition
  }
  renderDuelUI();
}
