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
        // TODO: trigger transition to duel summary UI here
        return;
    }

    // Live bot backend trigger
    if (duelState.currentPlayer === 'bot') {
        console.log("Bot's turn triggered — sending to backend...");

        fetch('https://duel-bot-backend-production.up.railway.app/bot/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(duelState)
        })
        .then(res => res.json())
        .then(updatedState => {
            Object.assign(duelState, updatedState);
            renderDuelUI();
        })
        .catch(err => {
            console.error("Bot move failed:", err);
        });
    }
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
    renderDuelUI();
});
