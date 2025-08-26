import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { flipCoin } from './coinFlip.js';
import { API_BASE } from './config.js';

export async function loadPracticeDuel() {
  let data;

  // 1) Fetch duelState from backend
  try {
    const res = await fetch(`${API_BASE}/bot/practice`, { method: 'GET' });
    if (!res.ok) throw new Error(`Backend not available (${res.status})`);
    data = await res.json();
    console.log('✅ Loaded practice data from backend:', data);
  } catch (err) {
    console.error('❌ Practice init failed:', err);
    alert('Practice server is not available. Check the API URL.');
    return;
  }

  // 2) Normalize backend → UI shape (bot → player2)
  if (data?.players?.bot && !data.players.player2) {
    data.players.player2 = data.players.bot;
    delete data.players.bot;
  }
  if (data?.currentPlayer === 'bot') data.currentPlayer = 'player2';

  // 3) Merge into UI state
  Object.assign(duelState, data);

  // 4) Render zones/UI (backend already drew 3 each — don’t draw here)
  document.getElementById("player1-hand").style.display = "flex";
  document.getElementById("player2-hand").style.display = "flex";
  document.getElementById("player1-field").style.display = "grid";
  document.getElementById("player2-field").style.display = "grid";

  renderHand('player1');
  renderHand('player2');
  renderField('player1');
  renderField('player2');
  renderDuelUI();

  // 5) Play coin flip animation to match backend’s chosen starter
  try {
    await flipCoin(duelState.currentPlayer);
  } catch {}
}
