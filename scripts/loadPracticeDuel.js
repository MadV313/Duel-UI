// scripts/loadPracticeDuel.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js'; // Optional but available

export async function loadPracticeDuel() {
  try {
    const response = await fetch('https://duel-bot-backend-production.up.railway.app/bot/practice');
    if (!response.ok) throw new Error('Failed to fetch practice duel state');

    const data = await response.json();

    // Inject duel state
    Object.assign(duelState, data);

    // Initial render of the Duel UI
    renderDuelUI();

    // Optional combo animation on duel load
    triggerAnimation('combo');

    // Update turn display explicitly
    const turnDisplay = document.getElementById('turn-display');
    if (turnDisplay) {
      const label = duelState.currentPlayer === 'player1' ? 'Player 1' : 'Bot';
      turnDisplay.textContent = `Turn: ${label}`;
    }

    console.log('Practice duel state loaded and UI rendered.');
  } catch (err) {
    console.error('Error loading practice duel:', err);
    alert('Could not load practice duel. Please try again or check backend.');
  }
}
