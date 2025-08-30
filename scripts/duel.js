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
function isTrapId(cardId) {
  const t = String(findCardMeta(cardId)?.type || '').toLowerCase();
  return t === 'trap';
}
function hasTag(meta, ...tags) {
  if (!meta) return false;
  const arr = Array.isArray(meta.tags)
    ? meta.tags.map(t => String(t).toLowerCase().trim())
    : String(meta.tags || '')
        .split(',')
        .map(t => t.toLowerCase().trim())
        .filter(Boolean);
  return tags.some(t => arr.includes(t));
}
function looksInfected(meta) {
  if (!meta) return false;
  if (hasTag(meta, 'infected')) return true;
  return /infected/i.test(String(meta.name || ''));
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

/** Cheap HP adjust with clamping (0–MAX_HP) */
function changeHP(playerKey, delta) {
  const p = duelState.players[playerKey];
  if (!p) return;
  const next = Math.max(0, Math.min(MAX_HP, Number(p.hp ?? MAX_HP) + Number(delta)));
  p.hp = next;
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
  // Bot's hand cards should appear face-down in UI (not relevant here but consistent)
  const entry = toEntry(raw, playerKey === 'player2');
  player.hand.push(entry);

  console.log(`[draw] ${playerKey} drew ${entry.cardId}`);
  return true;
}

/* ---------------- discard helpers ---------------- */

/** Returns true if played card should be discarded after resolving. */
function shouldAutoDiscard(meta) {
  if (!meta) return false;

  // Tags (if you ever add them): "consumable", "one_use", "discard_after_use"
  const tags = (Array.isArray(meta.tags) ? meta.tags : String(meta.tags || '')
    .split(',').map(s => s.trim().toLowerCase())).filter(Boolean);
  if (tags.includes('discard_after_use') || tags.includes('consumable') || tags.includes('one_use')) {
    return true;
  }

  // Flexible phrase match from your JSON effect strings
  const effect = String(meta.effect || '').toLowerCase();

  // Common phrasing variations
  const patterns = [
    /discard\s+this\s+card\s+(?:after|upon)\s+use/,
    /discard\s+after\s+use/,
    /use:\s*discard\s+this\s+card/,
    /then\s+discard\s+this\s+card/,
  ];
  if (patterns.some(rx => rx.test(effect))) return true;

  return false;
}

function moveFieldCardToDiscard(playerKey, cardObj) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const idx = P.field.indexOf(cardObj);
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
  }
}

/* ---- extra helpers for utilities/traps/infected (player effects) ---- */
function discardRandomTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const idx = P.field.findIndex(c => c && isTrapId(c.cardId));
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
    return true;
  }
  return false;
}

function revealRandomEnemyTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const traps = P.field.filter(c => c && isTrapId(c.cardId) && c.isFaceDown);
  if (traps.length) {
    const chosen = traps[Math.floor(Math.random() * traps.length)];
    chosen.isFaceDown = false;
    return true;
  }
  return false;
}

function destroyEnemyInfected(foeKey) {
  const P = duelState.players[foeKey];
  ensureZones(P);
  const idx = P.field.findIndex(c => looksInfected(findCardMeta(c.cardId)));
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
    return true;
  }
  return false;
}

/* ---------- very-lightweight effect resolver (UI side) ----------
   Parses common phrases in allCards.json "effect" text:
     - "deal XX DMG"                  → damages opponent
     - "heal XX"                      → heals self (capped to 200)
     - "draw N card(s)/loot card(s)"  → draws
     - "discard 1 card"               → discards from your hand (not the played card)
     - "skip next draw"               → sets a flag on the player
     - "destroy/remove 1 enemy field card (random)" → removes foe field card
     - "destroy/remove infected"      → targets infected on opponent field
     - "disarm/destroy/reveal trap"   → interacts with foe traps
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

  // heal X
  const mHeal = text.match(/heal\s+(\d+)/);
  if (mHeal) {
    const heal = Number(mHeal[1]);
    changeHP(you, +heal);
    console.log(`💚 ${meta.name}: healed ${you} for ${heal}`);
    triggerAnimation('heal');
  }

  // draw N card(s) / loot cards
  const mDraw = text.match(/draw\s+(a|\d+)\s+(?:loot\s+)?card/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
  }

  // discard 1 card (from your hand) — we discard the last card if any
  if (/\bdiscard\s+1\s+card\b(?!.*after\s+use)/.test(text)) {
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

  // destroy/remove 1 enemy field card (supports "random")
  if (/(?:destroy|remove)\s+(?:1\s+)?enemy(?:\s+field)?\s+card/.test(text)) {
    const foeField = duelState.players[foe].field || [];
    if (foeField.length) {
      const idx = /random/.test(text) ? Math.floor(Math.random() * foeField.length) : 0;
      const [destroyed] = foeField.splice(idx, 1);
      duelState.players[foe].discardPile ||= [];
      duelState.players[foe].discardPile.push(destroyed);
      console.log(`💥 ${meta.name}: destroyed one of ${foe}'s field cards`);
      triggerAnimation('explosion');
    }
  }

  // explicitly target infected on the enemy field
  if (/(?:destroy|kill|remove)\s+(?:1\s+)?infected/.test(text)) {
    if (destroyEnemyInfected(foe)) {
      console.log(`🧟 ${meta.name}: removed an infected from ${foe}'s field`);
      triggerAnimation('explosion');
    }
  }

  // disarm/destroy foe trap
  if (/(?:disarm|disable|destroy)\s+(?:an?\s+)?trap/.test(text)) {
    if (discardRandomTrap(foe)) {
      console.log(`🪤 ${meta.name}: disarmed a trap on ${foe}'s field`);
      triggerAnimation('explosion');
    }
  }

  // reveal foe trap
  if (/(?:reveal|expose)\s+(?:an?\s+)?trap/.test(text)) {
    if (revealRandomEnemyTrap(foe)) {
      console.log(`👀 ${meta.name}: revealed a trap on ${foe}'s field`);
      triggerAnimation('combo');
    }
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
 * - Traps stay face-down; others resolve immediately and may auto-discard
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
  const trap = type === 'trap';

  if (trap) {
    // Traps are placed face-down and do not resolve immediately
    card.isFaceDown = true;
    player.field.push(card);
    console.log(`🪤 Set trap: ${meta?.name ?? card.cardId} (face-down)`);
    triggerAnimation('trap');
    renderDuelUI();
    return;
  }

  // Non-traps: resolve immediately
  card.isFaceDown = false;
  player.field.push(card); // drop briefly for visuals
  resolveImmediateEffect(meta, playerKey);

  // Auto-discard the played card if effect / tags say so
  if (shouldAutoDiscard(meta)) {
    moveFieldCardToDiscard(playerKey, card);
  }

  triggerAnimation('combo');
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
