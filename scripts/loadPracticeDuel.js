import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { flipCoin } from './coinFlip.js';
import { API_BASE } from './config.js';

export async function loadPracticeDuel() {
  let data;

  // 1) Fetch from backend
  try {
    const res = await fetch(`${API_BASE}/bot/practice`, { method: 'GET' });
    if (!res.ok) throw new Error(`Backend not available (${res.status})`);
    data = await res.json();
    console.log('✅ Loaded practice data from backend:', data);
  } catch (err) {
    console.error('❌ Practice init failed:', err);
    alert('Practice server is not available. Check your backend URL.');
    return;
  }

  // 2) Normalize backend → UI shape
  // Backend uses players.player1 + players.bot
  if (data?.players?.bot && !data.players.player2) {
    data.players.player2 = data.players.bot;
    delete data.players.bot;
  }
  if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

  // 3) Merge into UI state
  Object.assign(duelState, data);

  // 4) Render
  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');
  renderDuelUI();

  // 5) Show coin flip **animation only**, using backend’s chosen starter
  try {
    await flipCoin(duelState.currentPlayer); // animate to match state
  } catch {
    /* no-op */
  }
}
