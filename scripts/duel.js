// scripts/duel.js — draw, discard, turn logic (UI-only)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';

// Helper: find card metadata by numeric id or "003" string
function findCardMeta(id) {
  const idStr = String(id).padStart(3, '0');
  return allCards.find(c => c.card_id === idStr);
}

// Keep buttons from being spammed during operations
function setControlsDisabled(disabled) {
  const buttons = [
    document.getElementById('startPracticeBtn'),
    ...document.querySelectorAll('#controls button')
  ].filter(Boolean);
  buttons.forEach(b => (b.disabled = !!disabled));
}

export function drawCard() {
  const playerKey = duelState.currentPlayer; // 'player1' | 'player2'
  const player = duelState.players[playerKey];
  if (!player) return;

  if (player.hand.length >= 4) {
    alert('Hand full! Play or discard a card first.');
    return;
  }
  if (player.deck.length === 0) {
    console.log('📭 Deck empty.');
    return;
  }

  const next = player.deck.shift(); // { cardId, isFaceDown? }
  player.hand.push(next);

  renderDuelUI();
}

export function discardCard(cardIndex) {
  const playerKey = duelState.currentPlayer;
  const player = duelState.players[playerKey];
  if (!player) return;

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  player.discardPile.push(card);
  console.log(`🗑️ Discarded: ${findCardMeta(card.cardId)?.name ?? card.cardId}`);
  renderDuelUI();
}

/**
 * End your turn.
 * We simply swap to the opponent, apply start-of-turn effects, and render.
 * renderDuelUI() will call the backend for the bot when it's player2's turn.
 */
export async function endTurn() {
  try {
    setControlsDisabled(true);

    // Swap turn locally
    duelState.currentPlayer =
      duelState.currentPlayer === 'player1' ? 'player2' : 'player1';

    applyStartTurnBuffs();
    triggerAnimation('turn');
    renderDuelUI();
  } finally {
    setControlsDisabled(false);
  }
}

// (Optional) also expose for any inline onclick fallbacks
window.drawCard = drawCard;
window.endTurn  = endTurn;
