// renderField.js

import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

// Function to render the field for a given player
export function renderField(player) {
    const fieldContainer = document.getElementById(`${player}-field`);
    fieldContainer.innerHTML = ''; // Clear previous field

    duelState[player].field.forEach(card => {
        const cardElement = renderCard(card.cardId, card.isFaceDown);
        fieldContainer.appendChild(cardElement);
    });
}
