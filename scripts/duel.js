// scripts/duel.js — draw, play, discard, turn logic (UI ↔ backend)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';

// Try to use your config helpers if present
let apiUrlFn = null;
try {
  // optional import at runtime – safe if config doesn’t export
  const mod = await import('./config.js');
  apiUrlFn = mod?.apiUrl || null;
} catch { /* no-op, we'll fall back to window.API_BASE */ }

// --- Config
const MAX_FIELD_SLOTS = 3;

// Helper to build API URLs robustly
function api(path) {
  if (apiUrlFn) return apiUrlFn(path);
  const base = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '/api';
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

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
  if (!Array.isArray(player.deck) || player.deck.length === 0) {
    console.log('📭 Deck empty.');
    return;
  }

  const next = player.deck.shift(); // { cardId, isFaceDown? } or id
  // Normalize to object
  const obj = typeof next === 'object' && next !== null
    ? next
    : { cardId: next, isFaceDown: false };

  player.hand.push(obj);
  renderDuelUI();
}

/**
 * Play a card from the current player's hand to their field.
 * - Only the active player (player1 on your client) may play.
 * - Field has 3 slots.
 * - Traps stay face-down; others are face-up on play.
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
    card = { cardId: card, isFaceDown: false };
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
 * Swap to the opponent, apply start-of-turn effects, re-render,
 * then call the backend for the bot if it’s the bot’s turn.
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

    // If it's now the bot's turn, ask the backend to act and return a new state
    if (duelState.currentPlayer === 'player2') {
      try {
        const url = api('/duel/turn');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: duelState })
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Bot turn failed ${res.status}: ${txt.slice(0, 250)}`);
        }
        const serverState = await res.json().catch(() => null);
        if (serverState && typeof serverState === 'object') {
          Object.assign(duelState, serverState);
        }
        renderDuelUI();
      } catch (err) {
        console.error('❌ /duel/turn error:', err);
        // Don’t crash the client; leave the state as-is.
      }
    }
  } finally {
    setControlsDisabled(false);
  }
}

// (Optional) also expose for any inline onclick fallbacks
window.drawCard    = drawCard;
window.endTurn     = endTurn;
window.playCard    = playCard;
window.discardCard = discardCard;
