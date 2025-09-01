// scripts/renderField.js — handles visual rendering of the field area (NO DISCARD TILES)
import { duelState } from './duelState.js';
import { renderCard } from './renderCard.js';

const MAX_FIELD_SLOTS = 3;

function asIdString(cardId) {
  return String(cardId).padStart(3, '0');
}

function makePlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'card slot-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  return placeholder;
}

/**
 * Renders the 0–N cards currently on a player's field.
 * - When `isSpectator` is true, clicks are disabled.
 * - Adds useful data-* attrs for debugging.
 * - Safely handles unknown/malformed card entries.
 * - Keeps a stable 3-slot grid with placeholders.
 * - ❌ No discard pile tile here (discard is hand-adjacent only).
 */
export function renderField(player, isSpectator = false) {
  const fieldContainer = document.getElementById(`${player}-field`);
  if (!fieldContainer) return;

  // Wipe and rebuild (removes any legacy discard nodes too)
  fieldContainer.innerHTML = '';

  const playerObj = duelState?.players?.[player] || {};
  const cards = Array.isArray(playerObj.field) ? playerObj.field : [];

  // Render up to MAX_FIELD_SLOTS actual field cards (state is usually clamped already)
  for (let index = 0; index < Math.min(cards.length, MAX_FIELD_SLOTS); index++) {
    const card = cards[index];

    // Accept either { cardId, isFaceDown } or raw string/number id
    const cardId = typeof card === 'object' && card !== null
      ? (card.cardId ?? card.id ?? card.card_id ?? '000')
      : card;

    const isFaceDown = Boolean(
      typeof card === 'object' && card !== null && card.isFaceDown
    );

    const el = renderCard(asIdString(cardId), isFaceDown);

    // Debug attrs
    el.dataset.player = player;
    el.dataset.index = String(index);
    el.dataset.cardId = asIdString(cardId);

    if (!isSpectator) {
      el.classList.add('clickable');
      el.addEventListener('click', () => {
        const ok = confirm(`Remove this card from ${player}'s field?`);
        if (!ok) return;
        try {
          if (index >= 0 && index < (duelState.players?.[player]?.field?.length ?? 0)) {
            duelState.players[player].field.splice(index, 1);
          }
        } catch (e) {
          console.warn('⚠️ Failed to remove field card:', e);
        }
        renderField(player, isSpectator);
      });
    } else {
      el.classList.add('spectator');
    }

    fieldContainer.appendChild(el);
  }

  // Fill remaining visible slots with placeholders (stable 3-slot grid)
  const placeholdersNeeded = Math.max(0, MAX_FIELD_SLOTS - Math.min(cards.length, MAX_FIELD_SLOTS));
  for (let i = 0; i < placeholdersNeeded; i++) {
    fieldContainer.appendChild(makePlaceholder());
  }

  // ✅ No discard tiles appended here.
}
