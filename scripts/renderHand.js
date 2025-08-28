// scripts/renderHand.js — renders a player's hand
import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

function asIdString(cardId) {
  return String(cardId).padStart(3, '0');
}

/**
 * Render the hand for a given player.
 * - When `isSpectator` is true, clicks are disabled.
 * - Opponent (player2) hand is auto face-down for non-spectators.
 * - Accepts card entries as objects ({cardId,isFaceDown}) or raw ids.
 * - Adds data-* attributes for easier debugging/inspection.
 */
export function renderHand(player, isSpectator = false) {
  const handContainer = document.getElementById(`${player}-hand`);
  if (!handContainer) return;

  // Clear current contents
  handContainer.innerHTML = '';

  const hand = Array.isArray(duelState?.players?.[player]?.hand)
    ? duelState.players[player].hand
    : [];

  console.log(`🖐️ Rendering hand for ${player} (${hand.length} cards)`, hand);

  if (hand.length === 0) {
    return;
  }

  // ✅ Hide opponent's hand unless spectator
  const hideHand = !isSpectator && player === 'player2';

  hand.forEach((entry, index) => {
    // Normalize entry
    const rawId =
      typeof entry === 'object' && entry !== null
        ? (entry.cardId ?? entry.id ?? entry.card_id ?? '000')
        : entry;

    // If we're hiding, force face-down regardless of entry flag
    const isFaceDown =
      hideHand
        ? true
        : (typeof entry === 'object' && entry !== null ? Boolean(entry.isFaceDown) : false);

    const cardIdStr = asIdString(rawId);
    const el = renderCard(cardIdStr, isFaceDown);

    // Debug attrs
    el.dataset.player = player;
    el.dataset.index = String(index);
    el.dataset.cardId = cardIdStr;
    el.dataset.faceDown = String(isFaceDown);

    // Interactions: only on your own (visible) hand in player view
    if (!isSpectator && !hideHand) {
      el.classList.add('clickable');
      el.title = 'Click to discard this card';
      el.addEventListener('click', () => {
        const ok = confirm(`Discard this card from ${player}'s hand?`);
        if (!ok) return;

        try {
          if (index >= 0 && index < (duelState.players?.[player]?.hand?.length ?? 0)) {
            duelState.players[player].hand.splice(index, 1);
          }
        } catch (e) {
          console.warn('⚠️ Failed to discard card:', e);
        }

        // Re-render this hand only
        renderHand(player, isSpectator);
      });
    } else {
      el.classList.add('spectator');
    }

    handContainer.appendChild(el);
  });
}
