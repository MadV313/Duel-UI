// scripts/duel.js — draw, discard, turn logic (UI-only; backend turn is triggered from renderDuelUI)
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

// Draw one card for the current player
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

  // Visual: backpack bonuses etc. happen in applyStartTurnBuffs()
  renderDuelUI();
}

// Discard a card by index from the current player's hand
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
 * We only flip the turn locally and re-render.
 * renderDuelUI() will detect "player2" (bot) and call the backend /duel/turn,
 * handling the bot<->player2 mapping for us.
 */
export function endTurn() {
  // Swap player
  duelState.currentPlayer = (duelState.currentPlayer === 'player1') ? 'player2' : 'player1';

  // Start-of-turn effects for whoever just became active
  applyStartTurnBuffs();

  // Nice visual pulse
  triggerAnimation('combo');

  // Re-render; if it's the bot's turn, renderDuelUI() will POST to the backend
  renderDuelUI();
}

// Expose for inline onclicks in index.html
window.drawCard = drawCard;
window.endTurn  = endTurn;
