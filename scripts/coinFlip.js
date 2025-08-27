// scripts/coinFlip.js
// Animates the opening coin toss and sets the active player.
// If the backend already decided (duelState.currentPlayer), pass it as `forceWinner`.

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';

/**
 * Flip the coin and set the starting player.
 * @param {'player1'|'player2'|null} forceWinner  Optional winner override (e.g., from backend)
 * @param {Object} opts
 * @param {boolean} [opts.animate=true]  Show overlay + gif
 * @param {number}  [opts.duration=1500] Animation duration in ms
 * @param {boolean} [opts.announce=true] Show announcement text
 * @returns {'player1'|'player2'} winner
 */
export function flipCoin(forceWinner = null, opts = {}) {
  const {
    animate = true,
    duration = 1500,
    announce = true,
  } = opts;

  // Prefer forced winner → existing state → random
  const decided =
    forceWinner ||
    duelState.currentPlayer ||
    (Math.random() < 0.5 ? 'player1' : 'player2');

  // Set and log
  duelState.currentPlayer = decided;

  const p1 = duelState?.players?.player1 || {};
  const p2 = duelState?.players?.player2 || {};
  const p1Name = p1.discordName || p1.name || 'Challenger';
  const p2Name = p2.discordName || p2.name || 'Practice Bot';

  const resultText =
    decided === 'player1'
      ? `🪙 Heads! ${p1Name} goes first!`
      : `🪙 Tails! ${p2Name} goes first!`;

  // Update turn banner immediately so the UI reflects the result even if we skip animation
  const turnEl = document.getElementById('turn-display');
  if (turnEl) {
    const who = decided === 'player1' ? p1Name : p2Name;
    turnEl.textContent = `${who} to act`;
  }

  if (!animate) {
    // No animation: just re-render with new currentPlayer
    renderDuelUI();
    return decided;
  }

  // Overlay announcement
  const overlay = document.getElementById('announcement');
  if (overlay && announce) {
    overlay.textContent = resultText;
    overlay.classList.remove('hidden');
  }

  // Coin GIF (optional)
  const gif = document.getElementById('coinFlipContainer');
  if (gif) gif.style.display = 'block';

  // Nice golden pulse
  triggerAnimation('combo');

  // Wrap up
  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
    if (gif) gif.style.display = 'none';
    renderDuelUI();
  }, Math.max(600, duration));

  return decided;
}
