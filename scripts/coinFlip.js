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
 * @param {boolean} [opts.animate=true]   Show overlay + gif
 * @param {number}  [opts.duration=2600]  Total animation duration in ms (slowed down)
 * @param {boolean} [opts.announce=true]  Show announcement text
 * @param {number}  [opts.revealAt]       Milliseconds into the animation to reveal winner
 * @returns {'player1'|'player2'} winner
 */
export function flipCoin(forceWinner = null, opts = {}) {
  const {
    animate = true,
    duration = 2600,     // ⏱ slower default so it doesn’t look glitched
    announce = true,
    revealAt,            // optional custom reveal timing
  } = opts;

  // Prefer forced winner → existing state → random
  const decided =
    forceWinner ||
    duelState.currentPlayer ||
    (Math.random() < 0.5 ? 'player1' : 'player2');

  // Set it now; we’ll reveal visually a bit later during the animation
  duelState.currentPlayer = decided;

  const p1 = duelState?.players?.player1 || {};
  const p2 = duelState?.players?.player2 || {};
  const p1Name = p1.discordName || p1.name || 'Challenger';
  const p2Name = p2.discordName || p2.name || 'Practice Bot';

  const resultText =
    decided === 'player1'
      ? `🪙 Heads! ${p1Name} goes first!`
      : `🪙 Tails! ${p2Name} goes first!`;

  // Elements
  const overlay = document.getElementById('announcement');
  const gif = document.getElementById('coinFlipContainer');
  const turnEl = document.getElementById('turn-display');

  // If not animating, reveal immediately and render
  if (!animate) {
    if (turnEl) {
      turnEl.textContent = `Turn: ${decided === 'player1' ? p1Name : p2Name}`;
      turnEl.classList.remove('hidden');
    }
    renderDuelUI();
    return decided;
  }

  // Stage 1: start flip — show "Flipping…" first
  if (gif) gif.style.display = 'block';
  if (overlay && announce) {
    overlay.textContent = '🪙 Flipping…';
    overlay.classList.remove('hidden');
  }
  triggerAnimation('combo');

  // Stage 2: reveal winner mid-animation for readability
  const revealMs = Math.max(700, Math.min(duration - 500, revealAt ?? Math.floor(duration * 0.6)));
  setTimeout(() => {
    if (overlay && announce) overlay.textContent = resultText;
    if (turnEl) {
      turnEl.textContent = `Turn: ${decided === 'player1' ? p1Name : p2Name}`;
      turnEl.classList.remove('hidden'); // reveal banner now, not earlier
    }
  }, revealMs);

  // Stage 3: wrap up and render
  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
    if (gif) gif.style.display = 'none';
    renderDuelUI();
  }, duration);

  return decided;
}
