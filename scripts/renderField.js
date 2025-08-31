// scripts/renderField.js — handles visual rendering of the field area
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
 * Renders the 0–N cards currently on a player's field, plus a discard stack tile.
 * - When `isSpectator` is true, clicks are disabled.
 * - Adds useful data-* attrs for debugging.
 * - Safely handles unknown/malformed card entries.
 * - Keeps a stable 3-slot grid with placeholders.
 * - Appends a discard pile tile (face-down stack with count badge).
 */
export function renderField(player, isSpectator = false) {
  const fieldContainer = document.getElementById(`${player}-field`);
  if (!fieldContainer) return;

  // Wipe and rebuild
  fieldContainer.innerHTML = '';

  const playerObj = duelState?.players?.[player] || {};
  const cards = Array.isArray(playerObj.field) ? playerObj.field : [];
  const discardPile = Array.isArray(playerObj.discardPile) ? playerObj.discardPile : [];

  console.log(`📦 Rendering ${player} field (${cards.length} cards)`, cards);

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
  }

  // Fill remaining visible slots with placeholders (stable 3-slot grid)
  const placeholdersNeeded = Math.max(0, MAX_FIELD_SLOTS - Math.min(cards.length, MAX_FIELD_SLOTS));
  for (let i = 0; i < placeholdersNeeded; i++) {
    fieldContainer.appendChild(makePlaceholder());
  }

  // --- Discard pile tile (face-down stack w/ count badge) ---
  // We render one face-down card representing the pile; shows count badge.
  const discardTile = document.createElement('div');
  discardTile.className = 'discard-tile';

  // Use the top of the pile if present (but render face-down regardless)
  const top = discardPile.length ? discardPile[discardPile.length - 1] : null;
  const topId = top
    ? asIdString(typeof top === 'object' ? (top.cardId ?? top.id ?? top.card_id ?? '000') : top)
    : '000';

  const discardCardEl = renderCard(topId, true); // always face-down visual
  discardCardEl.classList.add('discard-card');
  discardCardEl.dataset.player = player;
  discardCardEl.dataset.role = 'discard';
  discardCardEl.title = discardPile.length
    ? `Discard Pile (${discardPile.length})`
    : 'Discard Pile (empty)';

  // Count badge
  const countBadge = document.createElement('div');
  countBadge.className = 'stack-count';
  countBadge.textContent = String(discardPile.length);
  discardTile.appendChild(discardCardEl);
  discardTile.appendChild(countBadge);

  // For spectators, no interactions
  if (isSpectator) {
    discardTile.classList.add('spectator');
  } else {
    // Optional: simple peek action (no state change)
    discardTile.addEventListener('click', () => {
      // This is intentionally non-destructive — just a quick peek helper.
      if (!discardPile.length) {
        alert('Discard pile is empty.');
        return;
      }
      const topEntry = discardPile[discardPile.length - 1];
      const id = typeof topEntry === 'object' ? (topEntry.cardId ?? topEntry.id ?? topEntry.card_id ?? '000') : topEntry;
      alert(`Top of ${player}'s discard: #${asIdString(id)} (face-down in UI)`);
    });
  }

  fieldContainer.appendChild(discardTile);
}
