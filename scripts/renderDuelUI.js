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

    // Trigger duel summary upload and redirect
    if (!duelState.summarySaved) {
      console.log("Saving summary and redirecting...");

      const duelId = `duel_${Date.now()}`;
      const summary = {
        duelId,
        winner: duelState.winner,
        players: {
          player1: {
            name: duelState.players.player1.discordId || "Player 1",
            hp: duelState.players.player1.hp,
            field: duelState.players.player1.field,
            cardsPlayed:
              duelState.players.player1.deck.length +
              duelState.players.player1.discardPile.length,
          },
          player2: {
            name: duelState.players.player2.discordId || "Player 2",
            hp: duelState.players.player2.hp,
            field: duelState.players.player2.field,
            cardsPlayed:
              duelState.players.player2.deck.length +
              duelState.players.player2.discardPile.length,
          },
        },
      };

      duelState.summarySaved = true;

      fetch('https://duel-bot-backend-production.up.railway.app/summary/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      })
        .then(() => {
          window.location.href = `https://duel-bot-backend-production.up.railway.app/summary/${duelId}`;
        })
        .catch(err => {
          console.error('Summary save failed:', err);
        });
    }

    return; // Stop re-render loop
  }

  // If it's the bot's turn, trigger backend move
  if (duelState.currentPlayer === 'bot') {
    console.log("Bot's turn triggered — sending to backend...");

    fetch('https://duel-bot-backend-production.up.railway.app/bot/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duelState),
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
