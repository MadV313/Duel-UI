// scripts/duel.js — draw, discard, turn logic (UI ↔ backend)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';
import { apiUrl } from './config.js';

// Helper: find card metadata by numeric id or "003" string
function findCardMeta(id) {
  const idStr = String(id).padStart(3, '0');
  return allCards.find(c => c.card_id === idStr);
}

// Small helpers to avoid double-click spam while we hit the API
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

/**
 * End your turn ➜ send state to backend so the bot can act.
 * The backend returns the updated duelState (after bot move, coin flips, etc).
 */
export async function endTurn() {
  try {
    setControlsDisabled(true);

    // Locally move to opponent so your UI shows it's their turn
    // (server will return authoritative state next)
    duelState.currentPlayer =
      duelState.currentPlayer === 'player1' ? 'player2' : 'player1';

    applyStartTurnBuffs();
    triggerAnimation('combo');
    renderDuelUI();

    // POST to backend for bot move
    const res = await fetch(apiUrl('/duel/turn'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send *just enough* info. If your backend expects a different shape,
      // adjust here (e.g., { state: duelState } or full duelState directly).
      body: JSON.stringify({ state: duelState })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Bot turn failed ${res.status}: ${txt.slice(0, 200)}`);
    }

    const serverState = await res.json().catch(() => null);
    if (serverState && typeof serverState === 'object') {
      // Shallow-merge server state into our live object to keep references intact
      Object.assign(duelState, serverState);
    }

    renderDuelUI();
  } catch (err) {
    console.error('❌ /duel/turn error:', err);
    alert('Bot move failed. Check console and backend logs.');
  } finally {
    setControlsDisabled(false);
  }
}
