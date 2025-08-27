// scripts/renderField.js — handles visual rendering of the field area
import { duelState } from './duelState.js';
import { renderCard } from './renderCard.js';

function asIdString(cardId) {
  return String(cardId).padStart(3, '0');
}

/**
 * Renders the 0–N cards currently on a player's field.
 * - When `isSpectator` is true, clicks are disabled.
 * - Adds useful data-* attrs for debugging.
 * - Safely handles unknown/malformed card entries.
 */
export function renderField(player, isSpectator = false) {
  const fieldContainer = document.getElementById(`${player}-field`);
  if (!fieldContainer) return;

  // Wipe and rebuild
  fieldContainer.innerHTML = '';

  const playerObj = duelState?.players?.[player];
  const cards = Array.isArray(playerObj?.field) ? playerObj.field : [];

  console.log(`📦 Rendering ${player} field (${cards.length} cards)`, cards);

  // Nothing to render
  if (cards.length === 0) {
    // Optional: keep grid height with empty placeholders (style may hide these)
    for (let i = 0; i < 0; i++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'card slot-placeholder';
      fieldContainer.appendChild(placeholder);
    }
    return;
  }

  cards.forEach((card, index) => {
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
        // remove this card from the field (local UI-only action)
        const ok = confirm(`Remove this card from ${player}'s field?`);
        if (!ok) return;
        try {
          // Defensive: ensure still in range
          if (index >= 0 && index < (duelState.players?.[player]?.field?.length ?? 0)) {
            duelState.players[player].field.splice(index, 1);
          }
        } catch (e) {
          console.warn('⚠️ Failed to remove field card:', e);
        }
        // Re-render just this field to avoid circular imports
        renderField(player, isSpectator);
      });
    } else {
      el.classList.add('spectator');
    }

    fieldContainer.appendChild(el);
  });
}
