// scripts/coinFlip.js
// Animates the opening coin toss and sets the active player.
// If the backend already decided (duelState.currentPlayer), pass it as `forceWinner`.

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';

let coinFlipInProgress = false;

/**
 * Flip the coin and set the starting player.
 * Resolves AFTER the announcement/toast is hidden so callers can await it
 * to sequence "flip → toast → reveal UI/cards".
 *
 * @param {'player1'|'player2'|null} forceWinner  Optional winner override (e.g., from backend)
 * @param {Object} opts
 * @param {boolean} [opts.animate=true]   Show overlay + gif
 * @param {number}  [opts.duration=2600]  Total animation duration in ms (slowed down)
 * @param {boolean} [opts.announce=true]  Show announcement text
 * @param {number}  [opts.revealAt]       Milliseconds into the animation to reveal winner
 * @returns {Promise<'player1'|'player2'>} resolves with winner after animation ends
 */
export function flipCoin(forceWinner = null, opts = {}) {
  const {
    animate = true,
    duration = 2600,     // ⏱ slower default so it doesn’t look glitched
    announce = true,
    revealAt,            // optional custom reveal timing
  } = opts;

  // If a flip is already running, don't start another; just resolve to current.
  if (coinFlipInProgress) {
    return Promise.resolve(duelState.currentPlayer || 'player1');
  }
  coinFlipInProgress = true;

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

  // Helper: reveal the "Turn: X" banner in a way that survives inline style="display:none"
  function showTurnBanner() {
    if (!turnEl) return;
    turnEl.textContent = `Turn: ${decided === 'player1' ? p1Name : p2Name}`;
    turnEl.classList.remove('hidden');
    // Some pages start with style="display:none"; clear it explicitly:
    turnEl.style.display = '';
  }

  // If not animating, reveal immediately and render, but still return a Promise for consistency
  if (!animate) {
    showTurnBanner();
    renderDuelUI();
    coinFlipInProgress = false;
    return Promise.resolve(decided);
  }

  // Stage 1: start flip — show "Flipping…" first
  if (gif) gif.style.display = 'block';
  if (overlay && announce) {
    overlay.textContent = '🪙 Flipping…';
    overlay.classList.remove('hidden');
    // ensure visible if it had any inline styles previously
    overlay.style.display = '';
  }
  triggerAnimation('combo');

  // Stage 2: reveal winner mid-animation for readability
  const safeDuration = Math.max(800, Number(duration) || 2600);
  const revealMs = Math.max(700, Math.min(safeDuration - 500, revealAt ?? Math.floor(safeDuration * 0.6)));

  return new Promise(resolve => {
    setTimeout(() => {
      if (overlay && announce) overlay.textContent = resultText;
      showTurnBanner();
    }, revealMs);

    // Stage 3: wrap up and render, then resolve AFTER toast hides
    setTimeout(() => {
      if (overlay) overlay.classList.add('hidden');
      if (gif) gif.style.display = 'none';
      renderDuelUI();
      coinFlipInProgress = false;
      resolve(decided);
    }, safeDuration);
  });
}
