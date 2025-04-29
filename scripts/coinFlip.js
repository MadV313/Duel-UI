  // coinFlip.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';

export function flipCoin() {
    const result = Math.random() < 0.5 ? 'player1' : 'player2';
    duelState.currentPlayer = result;

    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.textContent = `Turn: ${result}`;

    alert(`${result === 'player1' ? 'Player 1' : 'Player 2'} wins the coin flip and goes first!`);

    renderDuelUI(); // Refresh the board after the flip
}
