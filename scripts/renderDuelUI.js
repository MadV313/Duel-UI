// renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import { API_BASE, UI_BASE } from './config.js';

// Check if the URL has the "spectator=true" parameter
const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';

// Fully renders the current state of the Duel UI
export function renderDuelUI() {
  // Render hands and fields (disabled for spectators)
  renderHand('player1', isSpectator);
  renderHand('player2', isSpectator);
  renderField('player1', isSpectator);
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

  // Winner: upload summary and redirect (if not spectator)
  if (duelState.winner) {
    alert(`${duelState.winner} wins the duel!`);

    if (!duelState.summarySaved && !isSpectator) {
      console.log("Saving summary and redirecting...");

      const duelId = `duel_${Date.now()}`;
      const summary = {
        duelId,
        winner: duelState.winner,
        hp: {
          player1: duelState.players.player1.hp,
          player2: duelState.players.player2.hp
        },
        cards: {
          player1: {
            field: duelState.players.player1.field.length,
            hand: duelState.players.player1.hand.length,
            deck: duelState.players.player1.deck.length,
            discard: duelState.players.player1.discardPile.length
          },
          player2: {
            field: duelState.players.player2.field.length,
            hand: duelState.players.player2.hand.length,
            deck: duelState.players.player2.deck.length,
            discard: duelState.players.player2.discardPile.length
          }
        }
      };

      duelState.summarySaved = true;

      fetch(`${API_BASE}/summary/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary)
      })
        .then(() => {
          // If you have a dedicated summary UI, set ?ui=<summary host> in the URL
          window.location.href = `${UI_BASE}/summary.html?duelId=${duelId}`;
        })
        .catch(err => console.error('Summary save failed:', err));
    }

    return; // Stop re-render loop
  }

  // If it's the bot's turn (player2) and not a spectator, trigger backend move
  if (duelState.currentPlayer === 'player2' && !isSpectator) {
    console.log("Bot's turn triggered — sending to backend...");

    // Map UI state (player2) -> backend expectation (bot)
    const payload = JSON.parse(JSON.stringify(duelState));
    if (payload.players?.player2 && !payload.players.bot) {
      payload.players.bot = payload.players.player2;
      delete payload.players.player2;
    }
    if (payload.currentPlayer === 'player2') payload.currentPlayer = 'bot';

    fetch(`${API_BASE}/duel/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(updatedState => {
        // Map backend response (bot) -> UI state (player2)
        if (updatedState?.players?.bot && !updatedState.players.player2) {
          updatedState.players.player2 = updatedState.players.bot;
          delete updatedState.players.bot;
        }
        if (updatedState?.currentPlayer === 'bot') updatedState.currentPlayer = 'player2';

        Object.assign(duelState, updatedState);
        renderDuelUI();
      })
      .catch(err => console.error("Bot move failed:", err));
  }
}
