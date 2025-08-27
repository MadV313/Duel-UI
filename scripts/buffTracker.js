// scripts/buffTracker.js — start-of-turn continuous buffs
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation, triggerAnimationByCard } from './animations.js';

// ———————————————————————————————————————————
// Small helpers
// ———————————————————————————————————————————
const HAND_LIMIT =
  (window.CONFIG && Number(window.CONFIG.handLimit)) || 4;

const normId = (v) => String(v ?? '').padStart(3, '0');

function hasFieldCard(player, cardIdStr) {
  if (!player?.field || !Array.isArray(player.field)) return false;
  return player.field.some(c => normId(c.cardId) === cardIdStr);
}

function safeArray(a) {
  return Array.isArray(a) ? a : [];
}

// ———————————————————————————————————————————
// Apply start-of-turn buffs for the active player
// ———————————————————————————————————————————
export function applyStartTurnBuffs() {
  const playerKey = duelState.currentPlayer;
  const p = duelState?.players?.[playerKey];
  if (!p) return;

  // Normalize structures in case backend/UI got out of sync
  p.hand = safeArray(p.hand);
  p.deck = safeArray(p.deck);
  p.field = safeArray(p.field);
  duelState.lootPile = safeArray(duelState.lootPile);

  let buffTriggered = false;

  // 🧳 Assault Backpack (#054): draw +1 if space in hand and deck available
  if (hasFieldCard(p, '054') && p.hand.length < HAND_LIMIT && p.deck.length > 0) {
    const drawn = p.deck.shift();
    p.hand.push(drawn);
    buffTriggered = true;
    // Visual hint based on the card that provided the buff
    triggerAnimationByCard('054');
  }

  // 🎒 Tactical Backpack (#056): draw +1 from loot pile if present and space
  if (hasFieldCard(p, '056') && duelState.lootPile.length > 0 && p.hand.length < HAND_LIMIT) {
    const lootCardId = duelState.lootPile.shift();
    p.hand.push({ cardId: normId(lootCardId), isFaceDown: false });
    buffTriggered = true;
    triggerAnimationByCard('056');
  }

  // Optional: global pulse to indicate passive effects just happened
  if (buffTriggered) {
    triggerAnimation('heal'); // subtle green pulse fits the “buff” vibe
    renderDuelUI();           // re-render once after all effects applied
  }
}
