// coinFlip.js
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';

export function flipCoin(forceWinner) {
  const winner = forceWinner || (Math.random() < 0.5 ? 'player1' : 'player2');
  const resultText = winner === 'player1'
    ? '🪙 Heads! Player 1 goes first!'
    : '🪙 Tails! Bot goes first!';

  duelState.currentPlayer = winner;

  const overlay = document.getElementById('announcement');
  if (overlay) {
    overlay.textContent = resultText;
    overlay.classList.remove('hidden');
  }

  const gif = document.getElementById('coinFlipContainer');
  if (gif) gif.style.display = 'block';

  triggerAnimation('combo');

  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
    if (gif) gif.style.display = 'none';
    renderDuelUI();
  }, 1500);
}
