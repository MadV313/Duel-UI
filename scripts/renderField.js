// renderField.js — handles visual rendering of the field area
import { duelState } from './duelState.js';
import { renderCard } from './renderCard.js';

export function renderField(player, isSpectator = false) {
  const fieldContainer = document.getElementById(`${player}-field`);
  if (!fieldContainer) return;

  fieldContainer.innerHTML = '';

  const cards = duelState.players[player]?.field;

  console.log(`📦 Rendering ${player} field:`, cards);

  if (!Array.isArray(cards)) {
    console.warn(`⚠️ No field array found for ${player}`);
    return;
  }

  cards.forEach((card, index) => {
    const cardElement = renderCard(card.cardId, card.isFaceDown);

    if (!isSpectator) {
      cardElement.addEventListener('click', () => {
        if (confirm(`Remove this card from ${player}'s field?`)) {
          duelState.players[player].field.splice(index, 1);
          renderField(player, isSpectator);
        }
      });
    }

    fieldContainer.appendChild(cardElement);
  });
}
