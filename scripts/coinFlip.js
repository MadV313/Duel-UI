// coinFlip.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js'; // Optional visual feedback

export function flipCoin() {
  // Randomly choose heads or tails
  const isHeads = Math.random() < 0.5;
  const winner = isHeads ? 'player1' : 'player2';
  const resultText = isHeads ? '🪙 Heads! Player 1 goes first!' : '🪙 Tails! Bot goes first!';

  duelState.currentPlayer = winner;

  // Update turn display
  const turnDisplay = document.getElementById('turn-display');
  turnDisplay.textContent = `Turn: ${winner === 'player1' ? 'Player 1' : 'Bot'}`;

  // Set up animated overlay
  const overlay = document.getElementById('announcement');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="coin-flip-container">
      <img src="images/effects/coin_flip.gif" alt="Coin Flip" class="coin-flip-image">
      <div class="coin-flip-result">${resultText}</div>
    </div>
  `;

  // Optional visual combo animation to signify duel start
  triggerAnimation('combo');

  // Hide after 4 seconds
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }, 4000);

  renderDuelUI(); // Refresh board visuals
}
