import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';

// Fully renders the current state of the Duel UI
export function renderDuelUI() {
  // Render hands and fields
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

  // Check for winner
  if (duelState.winner) {
    alert(`${duelState.winner} wins the duel!`);
    turnDisplay.textContent = `Winner: ${duelState.winner}`;

    // TODO: Trigger duel summary screen transition here
    return;
  }

  // If it's the bot's turn, trigger backend move
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
        renderDuelUI(); // Re-render after bot move
      })
      .catch(err => {
        console.error("Bot move failed:", err);
      });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  renderDuelUI();
});
