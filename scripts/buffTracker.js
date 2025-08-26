// buffTracker.js — start-of-turn continuous buffs
import { duelState } from './duelState.js';
import { renderDuelUI } from './renderDuelUI.js';
import { triggerAnimation, triggerAnimationByCard } from './animations.js';

function hasField(player, cardIdStr) {
  return player.field?.some(c => String(c.cardId).padStart(3, '0') === cardIdStr);
}

export function applyStartTurnBuffs() {
  const playerKey = duelState.currentPlayer;
  const p = duelState.players[playerKey];
  if (!p) return;

  let buffTriggered = false;

  // Assault Backpack (#054): draw +1 if space in hand and deck available
  if (hasField(p, '054') && p.hand.length < 4 && p.deck.length > 0) {
    p.hand.push(p.deck.shift());
    buffTriggered = true;
    triggerAnimationByCard('054');
  }

  // Tactical Backpack (#056): draw +1 from loot pile if present and space
  const loot = duelState.lootPile || [];
  if (hasField(p, '056') && loot.length > 0 && p.hand.length < 4) {
    const lootCardId = loot.shift();
    p.hand.push({ cardId: lootCardId, isFaceDown: false });
    buffTriggered = true;
    triggerAnimationByCard('056');
  }

  if (buffTriggered) triggerAnimation('heal');
  renderDuelUI();
}
