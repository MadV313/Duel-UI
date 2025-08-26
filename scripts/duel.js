// duel.js — draw, discard, turn logic (UI-only)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';

// Helper: find card metadata by numeric id or "003" string
function findCardMeta(id) {
  const idStr = typeof id === 'number' ? String(id).padStart(3, '0') : String(id).padStart(3, '0');
  return allCards.find(c => c.card_id === idStr);
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

  // Visual: backpack bonuses etc. happen in applyStartTurnBuffs()
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

export function endTurn() {
  // Apply start-of-next-turn buffs to the opponent (after swap)
  duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'player2' : 'player1';

  applyStartTurnBuffs();
  triggerAnimation('turn');
  renderDuelUI();
}
