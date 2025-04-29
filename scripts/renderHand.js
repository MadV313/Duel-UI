// renderHand.js

import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

// Function to render the hand for a given player
export function renderHand(player) {
    const handContainer = document.getElementById(`${player}-hand`);
    handContainer.innerHTML = ''; // Clear previous hand

    duelState[player].hand.forEach(card => {
        const cardElement = renderCard(card.cardId, card.isFaceDown);
        handContainer.appendChild(cardElement);
    });
}
