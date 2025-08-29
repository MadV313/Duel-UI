// scripts/duel.js — draw, play, discard, turn logic (UI-only)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';

// --- Config
const MAX_FIELD_SLOTS = 3;
const MAX_HAND = 4;

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

/* ---------- normalization helpers ---------- */
function toEntry(objOrId, faceDownDefault = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return { cardId: String(cid).padStart(3, '0'), isFaceDown: Boolean(objOrId.isFaceDown) };
  }
  return { cardId: String(objOrId).padStart(3, '0'), isFaceDown: faceDownDefault };
}

/** Draw one card for a specific player. Returns true if a card was drawn. */
function drawFor(playerKey) {
  const player = duelState?.players?.[playerKey];
  if (!player) return false;

  if (!Array.isArray(player.hand)) player.hand = [];
  if (!Array.isArray(player.deck)) player.deck = [];

  if (player.hand.length >= MAX_HAND) {
    console.log(`[draw] ${playerKey} hand full (${MAX_HAND}).`);
    return false;
  }
  if (player.deck.length === 0) {
    console.log(`[draw] ${playerKey} deck empty.`);
    return false;
  }

  const raw = player.deck.shift();
  // Bot's hand cards should appear face-down in UI
  const entry = toEntry(raw, playerKey === 'player2');
  player.hand.push(entry);

  console.log(`[draw] ${playerKey} drew ${entry.cardId}`);
  return true;
}

/* ---------- public actions ---------- */

/** Manual Draw button */
export function drawCard() {
  const who = duelState.currentPlayer; // 'player1' | 'player2'
  if (drawFor(who)) renderDuelUI();
}

/**
 * Play a card from the current player's hand to their field.
 * - Interactive plays allowed only for local human (player1)
 * - Field has 3 slots
 * - Traps stay face-down; others are face-up on play
 */
export function playCard(cardIndex) {
  const playerKey = duelState.currentPlayer;      // 'player1' | 'player2'
  const player    = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive plays for local human
  if (playerKey !== 'player1') return;

  if (!Array.isArray(player.hand) || cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }
  if (!Array.isArray(player.field)) player.field = [];
  if (player.field.length >= MAX_FIELD_SLOTS) {
    alert('Your field is full.');
    return;
  }

  // Take card from hand
  let card = player.hand.splice(cardIndex, 1)[0];
  // Normalize
  if (typeof card !== 'object' || card === null) {
    card = { cardId: String(card).padStart(3, '0'), isFaceDown: false };
  } else {
    card.cardId = String(card.cardId ?? card.id ?? card.card_id ?? '000').padStart(3, '0');
  }

  // Decide face-up/face-down on play
  const meta = findCardMeta(card.cardId);
  const isTrap = !!meta && String(meta.type || '').toLowerCase() === 'trap';
  card.isFaceDown = isTrap ? true : false;

  player.field.push(card);

  console.log(`▶️ Played: ${meta?.name ?? card.cardId} ${isTrap ? '(face-down trap)' : ''}`);
  triggerAnimation(isTrap ? 'trap' : 'combo');
  renderDuelUI();
}

export function discardCard(cardIndex) {
  const playerKey = duelState.currentPlayer;
  const player = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive discards for local human
  if (playerKey !== 'player1') return;

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  if (!Array.isArray(player.discardPile)) player.discardPile = [];
  player.discardPile.push(card);

  console.log(`🗑️ Discarded: ${findCardMeta(card.cardId)?.name ?? card.cardId}`);
  renderDuelUI();
}

/**
 * End your turn.
 * Swap players → auto-draw for the NEW player → start-turn buffs → render.
 * (If it's the bot's turn, renderDuelUI will handle calling the backend.)
 */
export async function endTurn() {
  try {
    setControlsDisabled(true);

    // Swap turn locally
    duelState.currentPlayer =
      duelState.currentPlayer === 'player1' ? 'player2' : 'player1';

    // Auto-draw for whoever just became active
    drawFor(duelState.currentPlayer);

    // Apply start-of-turn effects and render
    applyStartTurnBuffs();
    triggerAnimation('turn');
    renderDuelUI(); // bot turn will be kicked from renderDuelUI
  } finally {
    setControlsDisabled(false);
  }
}

// (Optional) also expose for any inline onclick fallbacks
window.drawCard    = drawCard;
window.endTurn     = endTurn;
window.playCard    = playCard;
window.discardCard = discardCard;
