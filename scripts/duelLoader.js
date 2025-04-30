// scripts/duelLoader.js

import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';

// Helper to extract query parameters
function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

const player1Id = getQueryParam('player1');
const player2Id = getQueryParam('player2') || 'bot'; // fallback for practice

if (player1Id && player2Id) {
  fetch('https://duel-bot-backend-production.up.railway.app/duel/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1Id, player2Id })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);

      // Overwrite frontend duelState with backend response
      Object.assign(duelState, data);

      // Auto-render once loaded
      renderDuelUI();
    })
    .catch(err => {
      console.error('Duel load failed:', err);
      alert('Failed to load duel. Make sure both players have linked decks.');
    });
}
