// scripts/duelLoader.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';

// ✅ Helper to extract query string parameters
function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

const player1Id = getQueryParam('player1');
const player2Id = getQueryParam('player2') || 'bot'; // Default to bot for practice mode

if (player1Id && player2Id) {
  fetch('https://duel-bot-backend-production.up.railway.app/duel/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1Id, player2Id })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);

      // ✅ Inject server response into shared frontend state
      Object.assign(duelState, data);

      // ✅ Initialize visual duel field
      renderDuelUI();
    })
    .catch(err => {
      console.error('❌ Duel load failed:', err);
      alert('Failed to load duel. Make sure both players have saved and linked decks.');
    });
}
