import { duelState, initializePracticeDuel, drawCard } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation } from './animations.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { flipCoin } from './coinFlip.js'; // 👈 Add this

export async function loadPracticeDuel() {
  let data;

  try {
    const response = await fetch('https://duel-bot-backend-production.up.railway.app/bot/practice');
    if (!response.ok) throw new Error('Backend not available');
    data = await response.json();
    Object.assign(duelState, data);
    console.log('✅ Loaded practice data from backend.');
  } catch (err) {
    console.warn('⚠️ Backend offline — using local practice init.');
    initializePracticeDuel();
  }

  // Auto-draw 3 cards
  drawCard('player1');
  drawCard('player1');
  drawCard('player1');
  drawCard('player2');
  drawCard('player2');
  drawCard('player2');

  // Render all UI
  renderDuelUI();
  triggerAnimation('combo');

  document.getElementById("player1-hand").style.display = "flex";
  document.getElementById("player2-hand").style.display = "flex";
  document.getElementById("player1-field").style.display = "grid";
  document.getElementById("player2-field").style.display = "grid";

  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');

  const turnDisplay = document.getElementById('turn-display');
  if (turnDisplay) {
    const label = duelState.currentPlayer === 'player1' ? 'Player 1' : 'Bot';
    turnDisplay.textContent = `Turn: ${label}`;
  }

  console.log('🎮 Practice duel rendered.');

  // 👇 Automatically flip coin after rendering
  flipCoin();
}
