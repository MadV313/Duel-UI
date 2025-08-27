// scripts/renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import { API_BASE, UI_BASE } from './config.js';

const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';

// Prevent double-sending bot turns if render fires rapidly
let botTurnInFlight = false;

function nameOf(playerKey) {
  const p = duelState?.players?.[playerKey] || {};
  // prefer discordName → name → fallback
  return p.discordName || p.name || (playerKey === 'player2' ? 'Practice Bot' : 'Player 1');
}

function setTurnText() {
  const el = document.getElementById('turn-display');
  if (!el) return;

  if (duelState.winner) {
    el.textContent = `Winner: ${duelState.winner} (${nameOf(duelState.winner)})`;
    return;
  }

  // Show friendly “whose turn” including the resolved display name
  const who = duelState.currentPlayer;
  const label = who === 'player1' ? 'Challenger' : 'Opponent';
  el.textContent = `Turn: ${label} — ${nameOf(who)}`;
}

function setHpText() {
  const p1hp = document.getElementById('player1-hp');
  const p2hp = document.getElementById('player2-hp');
  if (p1hp) p1hp.textContent = duelState.players.player1.hp;
  if (p2hp) p2hp.textContent = duelState.players.player2.hp;

  // Also inject names into the labels if those containers exist
  const hpWrap = document.getElementById('hp-display');
  try {
    const rows = hpWrap?.querySelectorAll('div');
    if (rows && rows[0]) {
      rows[0].innerHTML = `Challenger (${nameOf('player1')}) HP: <span id="player1-hp">${duelState.players.player1.hp}</span>`;
    }
    if (rows && rows[1]) {
      rows[1].innerHTML = `Opponent (${nameOf('player2')}) HP: <span id="player2-hp">${duelState.players.player2.hp}</span>`;
    }
  } catch {}
}

/** Fully renders the current state of the Duel UI */
export function renderDuelUI() {
  // Render hands and fields (disabled for spectators)
  renderHand('player1', isSpectator);
  renderHand('player2', isSpectator);
  renderField('player1', isSpectator);
  renderField('player2', isSpectator);

  setHpText();
  setTurnText();

  // If duel is over, save summary (non-spectator) and redirect
  if (duelState.winner) {
    // Guard: only handle once
    if (!duelState.summarySaved && !isSpectator) {
      const duelId = `duel_${Date.now()}`;
      const summary = {
        duelId,
        winner: duelState.winner,
        hp: {
          player1: duelState.players.player1.hp,
          player2: duelState.players.player2.hp,
        },
        cards: {
          player1: {
            field: duelState.players.player1.field.length,
            hand: duelState.players.player1.hand.length,
            deck: duelState.players.player1.deck.length,
            discard: duelState.players.player1.discardPile.length,
          },
          player2: {
            field: duelState.players.player2.field.length,
            hand: duelState.players.player2.hand.length,
            deck: duelState.players.player2.deck.length,
            discard: duelState.players.player2.discardPile.length,
          },
        },
      };

      duelState.summarySaved = true;

      fetch(`${API_BASE}/summary/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      })
        .catch(err => console.error('[UI] Summary save failed:', err))
        .finally(() => {
          // If you have a dedicated summary page, this will show it
          window.location.href = `${UI_BASE}/summary.html?duelId=${duelId}`;
        });
    }
    return;
  }

  // Bot turn driver: only when it's player2 (bot) AND not spectator
  if (duelState.currentPlayer === 'player2' && !isSpectator) {
    if (botTurnInFlight) return;
    botTurnInFlight = true;

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
      body: JSON.stringify(payload),
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Bot move failed: ${res.status}`);
        }
        return res.json();
      })
      .then(updated => {
        // Map backend response (bot) -> UI state (player2)
        if (updated?.players?.bot && !updated.players.player2) {
          updated.players.player2 = updated.players.bot;
          delete updated.players.bot;
        }
        if (updated?.currentPlayer === 'bot') updated.currentPlayer = 'player2';

        Object.assign(duelState, updated);
      })
      .catch(err => {
        console.error('[UI] Bot move error:', err);
      })
      .finally(() => {
        botTurnInFlight = false;
        // Re-render after bot move (or failure) to keep UI fresh
        setHpText();
        setTurnText();
        renderHand('player1', isSpectator);
        renderHand('player2', isSpectator);
        renderField('player1', isSpectator);
        renderField('player2', isSpectator);
      });
  }
}
