// renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';

// Check if the URL has the "spectator=true" parameter
const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';

// Fully renders the current state of the Duel UI
export function renderDuelUI() {
  // Render hands and fields (disabled for spectators)
  renderHand('player1', isSpectator);  // Pass isSpectator to disable interaction
  renderHand('player2', isSpectator);
  renderField('player1', isSpectator); // Pass isSpectator to disable interaction
  renderField('player2', isSpectator);

  // Update HP display
  const p1hp = document.getElementById('player1-hp');
  const p2hp = document.getElementById('player2-hp');
  if (p1hp && p2hp) {
    p1hp.textContent = duelState.players.player1.hp;
    p2hp.textContent = duelState.players.player2.hp;
  }

  // Update turn display
  const turnDisplay = document.getElementById('turn-display');
  if (turnDisplay) {
    turnDisplay.textContent = duelState.winner
      ? `Winner: ${duelState.winner}`
      : `Turn: ${duelState.currentPlayer}`;
  }

  // Check for winner
  if (duelState.winner) {
    alert(`${duelState.winner} wins the duel!`);

    // Trigger duel summary upload and redirect (if not in spectator mode)
    if (!duelState.summarySaved && !isSpectator) {
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
          window.location.href = `https://duel-summary-ui-production.up.railway.app/summary.html?duelId=${duelId}`;
        })
        .catch(err => {
          console.error('Summary save failed:', err);
        });
    }

    return; // Stop re-render loop
  }

  // If it's the bot's turn and not a spectator, trigger backend move
  if (duelState.currentPlayer === 'bot' && !isSpectator) {
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
