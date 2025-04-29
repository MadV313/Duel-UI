// renderDuelUI.js

import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';

// Function to fully render the current state of the Duel UI
export function renderDuelUI() {
    // Render both players' hands and fields
    renderHand('player1');
    renderHand('player2');
    renderField('player1');
    renderField('player2');

    // Update HP display
    document.getElementById('player1-hp').textContent = duelState.player1.hp;
    document.getElementById('player2-hp').textContent = duelState.player2.hp;

    // Update turn display
    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.textContent = `Turn: ${duelState.currentPlayer}`;
}

// Optional: Call this once at the very beginning to initialize UI
document.addEventListener('DOMContentLoaded', () => {
    renderDuelUI();
});
