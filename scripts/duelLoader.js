// scripts/duelLoader.js
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { API_BASE } from './config.js';

const qs = new URLSearchParams(location.search);
const player1Id = qs.get('player1');
const player2Id = qs.get('player2') || 'bot';

if (player1Id && player2Id) {
  fetch(`${API_BASE}/duel/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1Id, player2Id })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);

      // Normalize bot → player2 for the UI
      if (data?.players?.bot && !data.players.player2) {
        data.players.player2 = data.players.bot;
        delete data.players.bot;
      }
      if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

      Object.assign(duelState, data);
      renderDuelUI();
    })
    .catch(err => {
      console.error('❌ Duel load failed:', err);
      alert('Failed to load duel. Make sure both players saved/linked decks.');
    });
}
