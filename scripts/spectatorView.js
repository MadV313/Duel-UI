import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';

// Renders the Duel UI for spectators (read-only)
export function renderSpectatorView() {
    // Render hands and fields for both players (view only, no interaction)
    renderHand('player1', true);  // 'true' = disable interaction (read-only)
    renderHand('player2', true);
    renderField('player1', true);
    renderField('player2', true);

    // Update HP display
    document.getElementById('player1-hp').textContent = duelState.players.player1.hp;
    document.getElementById('player2-hp').textContent = duelState.players.player2.hp;

    // Show current turn
    const turnDisplay = document.getElementById('turn-display');
    turnDisplay.textContent = `Current Turn: ${duelState.currentPlayer}`;

    // Check for winner
    if (duelState.winner) {
        const winnerMessage = document.getElementById('winner-message');
        winnerMessage.textContent = `${duelState.winner} wins the duel!`;

        // Optionally, trigger summary transition or other actions
        // Example: show end-of-game options, stats, etc.
    }

    // Optionally, render animations or effects (e.g., attack, heal, poison)
    renderAnimations();
}

// Helper function to render any active animations (attacks, heal, poison, etc.)
function renderAnimations() {
    // Check for attack animations or any other status effects that should be displayed
    // Example: show a "fire" animation when an attack happens
    if (duelState.players.player1.field.some(card => card.effect === 'attack')) {
        // For example, if player1 is attacking, show an animation
        document.body.classList.add('animation.attack');
    }

    // Similar checks for other status effects (e.g., shield, poison, etc.)
    if (duelState.players.player2.field.some(card => card.effect === 'shield')) {
        // Add any necessary classes to trigger CSS animations (e.g., shield effect)
        document.body.classList.add('animation.shield');
    }
}
