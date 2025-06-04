// scripts/loadPracticeDuel.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';

export async function loadPracticeDuel() {
  let data;

  try {
    const response = await fetch('https://duel-bot-backend-production.up.railway.app/bot/practice');
    if (!response.ok) throw new Error('Backend not available');
    data = await response.json();
    console.log('✅ Loaded practice data from backend.');
  } catch (err) {
    console.warn('⚠️ Backend offline — loading mock data locally.');
    try {
      const fallback = await fetch('data/mock_practice_duel.json');
      if (!fallback.ok) throw new Error('Mock file not found');
      data = await fallback.json();
      console.log('✅ Loaded practice mock data from local file.');
    } catch (fallbackErr) {
      console.error('❌ Failed to load local mock data:', fallbackErr);
      alert('Practice mode is unavailable. Backend is offline and no local mock file found.');
      return;
    }
  }

  // Inject duel state
  Object.assign(duelState, data);

  // Render the duel UI
  renderDuelUI();
  triggerAnimation('combo');

  // Ensure card containers are visible
  document.getElementById("player1-hand").style.display = "flex";
  document.getElementById("player2-hand").style.display = "flex";
  document.getElementById("player1-field").style.display = "grid";
  document.getElementById("player2-field").style.display = "grid";

  // Re-render hands and fields
  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');

  // Update turn display
  const turnDisplay = document.getElementById('turn-display');
  if (turnDisplay) {
    const label = duelState.currentPlayer === 'player1' ? 'Player 1' : 'Bot';
    turnDisplay.textContent = `Turn: ${label}`;
  }

  console.log('🎮 Practice duel rendered.');
}
