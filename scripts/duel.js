// scripts/duel.js — draw, play, discard, turn logic (UI-only)
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';

// --- Config (UI guards)
const MAX_FIELD_SLOTS = 3;
const MAX_HAND        = 4;
const MAX_HP          = 200;

/* ---------------- helpers ---------------- */

function pad3(id) { return String(id).padStart(3, '0'); }

// Lookup meta by numeric id or "003" string
function findCardMeta(id) {
  return allCards.find(c => c.card_id === pad3(id));
}

// Debounce control buttons during async / heavy ops
function setControlsDisabled(disabled) {
  const buttons = [
    document.getElementById('startPracticeBtn'),
    ...document.querySelectorAll('#controls button')
  ].filter(Boolean);
  buttons.forEach(b => (b.disabled = !!disabled));
}

/* ---------- normalization helpers ---------- */
function toEntry(objOrId, faceDownDefault = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return { cardId: pad3(cid), isFaceDown: Boolean(objOrId.isFaceDown ?? faceDownDefault) };
  }
  return { cardId: pad3(objOrId), isFaceDown: faceDownDefault };
}

function ensureZones(p) {
  p.hand        ||= [];
  p.field       ||= [];
  p.deck        ||= [];
  p.discardPile ||= [];
}

/** HP adjust with clamping to 0…MAX_HP */
function changeHP(playerKey, delta) {
  const p = duelState.players[playerKey];
  if (!p) return;
  const before = Number(p.hp ?? 0);
  const raw    = before + Number(delta);
  const next   = Math.max(0, Math.min(MAX_HP, raw));
  p.hp = next;
  if (raw !== next) {
    console.log(`[hp] ${playerKey} change ${delta} capped to ${next}/${MAX_HP}`);
  }
}

/* ---------- draw logic ---------- */

/** Draw one card for a specific player. Returns true if a card was drawn. */
function drawFor(playerKey) {
  const player = duelState?.players?.[playerKey];
  if (!player) return false;
  ensureZones(player);

  // Handle "skip next draw" flag (set by some card effects)
  if (player.skipNextDraw) {
    console.log(`[draw] ${playerKey} draw skipped due to effect.`);
    player.skipNextDraw = false;
    return false;
  }

  if (player.hand.length >= MAX_HAND) {
    console.log(`[draw] ${playerKey} hand full (${MAX_HAND}).`);
    return false;
  }
  if (player.deck.length === 0) {
    console.log(`[draw] ${playerKey} deck empty.`);
    return false;
  }

  const raw = player.deck.shift();
  // Bot's hand cards should appear face-down in UI
  const entry = toEntry(raw, playerKey === 'player2');
  player.hand.push(entry);

  console.log(`[draw] ${playerKey} drew ${entry.cardId}`);
  return true;
}

/* ---------- very-lightweight effect resolver (UI side) ----------
   This lets common effects feel responsive without needing backend resolve.
   It parses friendly phrases in allCards.json "effect" text:
     - "deal XX DMG"                       → damages opponent
     - "heal/restore XX"                   → heals self (capped at MAX_HP)
     - "draw N (loot) card(s)"             → draws
     - "discard 1 card"                    → discards last from your hand
     - "skip next draw"                    → sets a flag on the player
     - "Discard this card after use."      → move to discard immediately
   Traps are not resolved here—they remain face-down on the field.
----------------------------------------------------------------- */
function resolveImmediateEffect(meta, ownerKey) {
  if (!meta) return;

  const you   = ownerKey;
  const foe   = ownerKey === 'player1' ? 'player2' : 'player1';
  const text  = String(meta.effect || '').toLowerCase();

  // deal X dmg (to foe)
  const mDmg = text.match(/deal\s+(\d+)\s*dmg/);
  if (mDmg) {
    const dmg = Number(mDmg[1]);
    changeHP(foe, -dmg);
    console.log(`⚔️ ${meta.name}: dealt ${dmg} DMG to ${foe}`);
    triggerAnimation('bullet');
  }

  // heal/restore X
  const mHeal = text.match(/(?:heal|restore)\s+(\d+)/);
  if (mHeal) {
    const heal = Number(mHeal[1]);
    changeHP(you, +heal);
    console.log(`💚 ${meta.name}: healed ${you} for ${heal}`);
    triggerAnimation('heal');
  }

  // draw N card(s) — tolerate “loot card” wording
  const mDraw = text.match(/draw\s+(a|\d+)\s+(?:\w+\s+)?card/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
  }

  // discard 1 card (from your hand) — discard last if any
  if (/discard\s+1\s+card/.test(text)) {
    const hand = duelState.players[you].hand;
    if (hand.length) {
      const tossed = hand.pop();
      duelState.players[you].discardPile ||= [];
      duelState.players[you].discardPile.push(tossed);
      console.log(`🗑️ ${meta.name}: discarded a card from ${you}'s hand`);
    }
  }

  // skip next draw
  if (/skip\s+next\s+draw/.test(text)) {
    duelState.players[you].skipNextDraw = true;
    console.log(`⏭️ ${meta.name}: ${you} will skip their next draw`);
  }
}

/* ---------- public actions ---------- */

/** Manual Draw button */
export function drawCard() {
  const who = duelState.currentPlayer; // 'player1' | 'player2'
  if (drawFor(who)) renderDuelUI();
}

/**
 * Play a card from the current player's hand to their field.
 * - Interactive plays allowed only for local human (player1)
 * - Field has 3 slots (UI guard)
 * - Traps stay face-down; others resolve immediately and usually go to discard
 */
export function playCard(cardIndex) {
  const playerKey = duelState.currentPlayer;      // 'player1' | 'player2'
  const player    = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive plays for local human
  if (playerKey !== 'player1') return;

  ensureZones(player);

  if (!Array.isArray(player.hand) || cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }
  if (!Array.isArray(player.field)) player.field = [];
  if (player.field.length >= MAX_FIELD_SLOTS) {
    alert('Your field is full.');
    return;
  }

  // Take card from hand
  let card = player.hand.splice(cardIndex, 1)[0];
  // Normalize
  if (typeof card !== 'object' || card === null) {
    card = { cardId: pad3(card), isFaceDown: false };
  } else {
    card.cardId = pad3(card.cardId ?? card.id ?? card.card_id ?? '000');
  }

  // Decide face-up/face-down on play
  const meta = findCardMeta(card.cardId);
  const type = String(meta?.type || '').toLowerCase();
  const isTrap = type === 'trap';

  if (isTrap) {
    // Traps are placed face-down and do not resolve immediately
    card.isFaceDown = true;
    player.field.push(card);
    console.log(`🪤 Set trap: ${meta?.name ?? card.cardId} (face-down)`);
    triggerAnimation('trap');
  } else {
    // Non-traps: resolve immediately
    card.isFaceDown = false;
    player.field.push(card); // temporarily place (helps visuals)
    resolveImmediateEffect(meta, playerKey);

    // If card text says to discard after use, move it to discard now
    if (/discard\s+this\s+card\s+after\s+use/.test(String(meta?.effect || '').toLowerCase())) {
      player.field.pop(); // remove from field
      player.discardPile ||= [];
      player.discardPile.push(card);
    }
    triggerAnimation('combo');
  }

  renderDuelUI();
}

export function discardCard(cardIndex) {
  const playerKey = duelState.currentPlayer;
  const player = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive discards for local human
  if (playerKey !== 'player1') return;

  ensureZones(player);

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  player.discardPile.push(card);

  const meta = findCardMeta(card.cardId);
  console.log(`🗑️ Discarded: ${meta?.name ?? card.cardId}`);
  renderDuelUI();
}

/**
 * End your turn.
 * Swap players → auto-draw for the NEW player → start-turn buffs → render.
 * (If it's the bot's turn, renderDuelUI will handle calling the backend.)
 */
export async function endTurn() {
  try {
    setControlsDisabled(true);

    // Swap turn locally
    duelState.currentPlayer =
      duelState.currentPlayer === 'player1' ? 'player2' : 'player1';

    // Auto-draw for whoever just became active
    drawFor(duelState.currentPlayer);

    // Apply start-of-turn effects and render
    applyStartTurnBuffs();
    triggerAnimation('turn');
    renderDuelUI(); // bot turn will be kicked from renderDuelUI
  } finally {
    setControlsDisabled(false);
  }
}

// (Optional) also expose for any inline onclick fallbacks
window.drawCard    = drawCard;
window.endTurn     = endTurn;
window.playCard    = playCard;
window.discardCard = discardCard;
