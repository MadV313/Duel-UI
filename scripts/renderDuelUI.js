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
    document.getElementById('player1-hp').textContent = duelState.players.player1.hp;
    document.getElementById('player2-hp').textContent = duelState.players.player2.hp;

    // Update turn display
    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.textContent = `Turn: ${duelState.currentPlayer}`;

    // Show winner if duel has ended
    if (duelState.winner) {
        alert(`${duelState.winner} wins the duel!`);
        turnDisplay.textContent = `Winner: ${duelState.winner}`;
    }

    // Placeholder for practice bot trigger (flagged for later)
    if (duelState.currentPlayer === 'bot') {
        console.log("Bot's turn triggered — awaiting backend connection...");
        // Later: fetch bot move or call applyBotMove()
    }
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
    renderDuelUI();
});
