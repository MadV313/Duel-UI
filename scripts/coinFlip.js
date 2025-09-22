// scripts/coinFlip.js
// Animates the opening coin toss and sets the active player.
// If the backend already decided (duelState.currentPlayer), pass it as `forceWinner`.

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';
import { audio } from './audio.js';

let coinFlipInProgress = false;

/**
 * Flip the coin and set the starting player.
 * Resolves AFTER the announcement/toast is hidden so callers can await it
 * to sequence "flip → toast → reveal UI/cards".
 *
 * IMPORTANT:
 *  - This function does NOT force a full UI render by default. That prevents
 *    the board from appearing before the flip finishes. If you really want the
 *    render to happen here, pass { renderAfter: true }.
 *
 * @param {'player1'|'player2'|null} forceWinner  Optional winner override (e.g., from backend)
 * @param {Object} opts
 * @param {boolean} [opts.animate=true]   Show overlay + gif
 * @param {number}  [opts.duration=2600]  Total animation duration in ms
 * @param {boolean} [opts.announce=true]  Show announcement text
 * @param {number}  [opts.revealAt]       Milliseconds into the animation to reveal winner
 * @param {boolean} [opts.renderAfter=false] Call renderDuelUI at the end (default false)
 * @returns {Promise<'player1'|'player2'>} resolves with winner after animation ends
 */
export function flipCoin(forceWinner = null, opts = {}) {
  const {
    animate = true,
    duration = 2600,
    announce = true,
    revealAt,
    renderAfter = false,
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
  const overlay = document.getElementById('announcement');           // toast box
  const container = document.getElementById('coinFlipContainer');    // outer wrapper
  const turnEl = document.getElementById('turn-display');            // center banner
  const imgEl = container?.querySelector('.coin-flip-image');        // gif inside

  // Helper: ensure the image has a valid src; try fallback if first path fails.
  function ensureCoinGif() {
    if (!imgEl) return;

    const primary = imgEl.getAttribute('src') || '';
    const candidates = [
      primary,                                // whatever index.html set
      'images/effects/coinflip.gif',          // common location with snowfall
      'images/coinflip.gif',                  // simple images folder
    ].filter(Boolean);

    let tried = 0;

    function tryNext() {
      if (tried >= candidates.length) return; // nothing else to try
      const next = candidates[tried++];
      if (!next) return;
      // Only reassign if different, to avoid loops
      if (imgEl.src.endsWith(next)) return;

      // Assign and hook one-time error to try the next candidate
      imgEl.onerror = () => {
        // suppress default broken image icon logs
        imgEl.onerror = null;
        tryNext();
      };
      imgEl.src = next;
    }

    tryNext();
  }

  // Helper: reveal the "Turn: X — Name" banner in a way that survives inline display:none
  function showTurnBanner() {
    if (!turnEl) return;
    const label = decided === 'player1' ? 'Challenger' : 'Opponent';
    const name = decided === 'player1' ? p1Name : p2Name;
    turnEl.textContent = `Turn: ${label} — ${name}`;
    turnEl.classList.remove('hidden');
    turnEl.style.removeProperty('display'); // some pages start with display:none
  }

  // Always start with the banner hidden until reveal moment
  if (turnEl) {
    turnEl.classList.add('hidden');
    turnEl.style.display = 'none';
  }

  // If not animating, reveal immediately and (optionally) render, but still return a Promise
  if (!animate) {
    try { showTurnBanner(); } finally {
      if (renderAfter) renderDuelUI();
      coinFlipInProgress = false;
    }
    return Promise.resolve(decided);
  }

  // Stage 1: force the flip UI visible and guarantee a paint before timers start
  try {
    if (container) {
      // Make sure container can center content even if CSS was missing
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.visibility = 'visible';
    }
    if (overlay) {
      if (announce) overlay.textContent = '🪙 Flipping…';
      overlay.classList.remove('hidden');
      overlay.style.removeProperty('display');
      overlay.style.visibility = 'visible';
    }
    ensureCoinGif();                  // make sure an image path is valid
    triggerAnimation?.('combo');      // small flair; safe if undefined

    // 🔊 Play coin-flip SFX on a UI channel (overlaps, not queued)
    try {
      if (typeof audio.coinFlip === 'function') {
        audio.coinFlip();
      } else {
        // Fallback if older audio.js without coinFlip() is present
        audio.play('coin_flip.mp3', { channel: 'ui', policy: 'overlap' });
      }
    } catch {}

    // Force a reflow so browsers actually paint before we schedule the reveal
    // (prevents the "skip" feel on some devices)
    // eslint-disable-next-line no-unused-expressions
    overlay && overlay.offsetHeight;
  } catch { /* non-fatal UI prep */ }

  // Stage 2: reveal winner mid-animation for readability
  const safeDuration = Math.max(800, Number(duration) || 2600);
  const revealMs = Math.max(700, Math.min(safeDuration - 500, revealAt ?? Math.floor(safeDuration * 0.6)));

  return new Promise(resolve => {
    const revealTimer = setTimeout(() => {
      try {
        if (overlay && announce) overlay.textContent = resultText;
        showTurnBanner();
      } catch {}
    }, revealMs);

    // Stage 3: wrap up and (optionally) render, then resolve AFTER toast hides
    const endTimer = setTimeout(() => {
      try {
        if (overlay) overlay.classList.add('hidden');
        if (container) {
          container.style.display = 'none';
          container.style.visibility = 'hidden';
        }
        if (renderAfter) renderDuelUI();
      } finally {
        coinFlipInProgress = false;
        resolve(decided);
      }
    }, safeDuration);

    // (Defensive) If the page is being torn down, clear timers
    window.addEventListener(
      'beforeunload',
      () => {
        clearTimeout(revealTimer);
        clearTimeout(endTimer);
        coinFlipInProgress = false;
      },
      { once: true }
    );
  });
}
