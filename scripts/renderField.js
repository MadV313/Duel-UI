// renderField.js — handles visual rendering of the field area
import { duelState } from './duelState.js';
import { renderCard } from './renderCard.js';

// Render a player's field (4-card max)
export function renderField(player, isSpectator = false) {
  const fieldContainer = document.getElementById(`${player}-field`);
  if (!fieldContainer) return;

  // Clear current field display
  fieldContainer.innerHTML = '';

  const cards = duelState.players[player].field;

  cards.forEach((card, index) => {
    const cardElement = renderCard(card.cardId, card.isFaceDown);

    // Optional interaction for removing cards (dev/test use only)
    if (!isSpectator) {
      cardElement.addEventListener('click', () => {
        if (confirm(`Remove this card from ${player}'s field?`)) {
          duelState.players[player].field.splice(index, 1);
          renderField(player, isSpectator); // Re-render field
        }
      });
    }

    fieldContainer.appendChild(cardElement);
  });
}
