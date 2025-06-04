// coinFlip.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js'; // Optional visual feedback

export function flipCoin() {
  // Randomly choose heads or tails
  const isHeads = Math.random() < 0.5;
  const winner = isHeads ? 'player1' : 'player2';
  const resultText = isHeads ? '🪙 Heads! Player 1 goes first!' : '🪙 Tails! Bot goes first!';

  // Update duel state
  duelState.currentPlayer = winner;

  // Update turn display
  const turnDisplay = document.getElementById('turn-display');
  turnDisplay.textContent = `Turn: ${winner === 'player1' ? 'Player 1' : 'Bot'}`;

  // 🔘 Show overlay announcement with result text
  const overlay = document.getElementById('announcement');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="coin-flip-container">
      <img src="images/effects/coin_flip.gif" alt="Coin Flip" class="coin-flip-image">
      <div class="coin-flip-result">${resultText}</div>
    </div>
  `;

  // 🔘 Also show the GIF container from HTML for centered effect
  const gifContainer = document.getElementById('coinFlipContainer');
  if (gifContainer) {
    gifContainer.style.display = 'block';
  }

  // Optional entrance animation (from combo system)
  triggerAnimation('combo');

  // Cleanup visuals after 4 seconds
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    if (gifContainer) gifContainer.style.display = 'none';
  }, 4000);

  // Re-render UI after flip
  renderDuelUI();
}
