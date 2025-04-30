// renderHand.js — renders a player's hand
import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

// Render the hand for a given player
export function renderHand(player) {
    const handContainer = document.getElementById(`${player}-hand`);
    handContainer.innerHTML = ''; // Clear current hand

    const hand = duelState.players[player].hand;

    hand.forEach(card => {
        const cardId = card.cardId || card.card_id || card; // supports ID strings or card objects
        const isFaceDown = card.isFaceDown || false;

        const cardElement = renderCard(cardId, isFaceDown);

        // Optionally: add interaction buttons in the future
        // const playBtn = document.createElement('button');
        // playBtn.textContent = 'Play';
        // cardElement.appendChild(playBtn);

        handContainer.appendChild(cardElement);
    });
}
