// scripts/loadPracticeDuel.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';

export async function loadPracticeDuel() {
  try {
    const response = await fetch('https://duel-bot-backend-production.up.railway.app/bot/practice');
    if (!response.ok) throw new Error('Failed to fetch practice duel state');

    const data = await response.json();
    
    // Inject the duelState received from backend
    Object.assign(duelState, data);

    // Initial render of the Duel UI
    renderDuelUI();
    console.log('Practice duel state loaded and UI rendered.');
  } catch (err) {
    console.error('Error loading practice duel:', err);
    alert('Could not load practice duel. Please try again or check backend.');
  }
}
