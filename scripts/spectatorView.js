// spectatorView.js — Renders the Duel UI in read-only mode for spectators

import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';

// Renders the Duel UI for spectators (read-only)
export function renderSpectatorView() {
  // Render hands and fields for both players (read-only)
  renderHand('player1', true);
  renderHand('player2', true);
  renderField('player1', true);
  renderField('player2', true);

  // Update HP display
  const hp1 = document.getElementById('player1-hp');
  const hp2 = document.getElementById('player2-hp');
  if (hp1 && hp2) {
    hp1.textContent = duelState.players.player1.hp;
    hp2.textContent = duelState.players.player2.hp;
  }

  // Show current turn
  const turnDisplay = document.getElementById('turn-display');
  if (turnDisplay) {
    turnDisplay.textContent = `Current Turn: ${duelState.currentPlayer}`;
  }

  // Show winner (if any)
  if (duelState.winner) {
    const winnerMessage = document.getElementById('winner-message');
    if (winnerMessage) {
      winnerMessage.textContent = `${duelState.winner} wins the duel!`;
    }
  }

  // Optional animations for active card effects
  renderAnimations();
}

// Helper function to render active visual effects
function renderAnimations() {
  document.body.classList.remove('animation-attack', 'animation-shield'); // Reset

  const p1Field = duelState.players.player1.field;
  const p2Field = duelState.players.player2.field;

  const hasAttack = [...p1Field, ...p2Field].some(card => card.effect === 'attack');
  const hasShield = [...p1Field, ...p2Field].some(card => card.effect === 'shield');

  if (hasAttack) document.body.classList.add('animation-attack');
  if (hasShield) document.body.classList.add('animation-shield');
}
