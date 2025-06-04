// renderHand.js — renders a player's hand
import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

// Render the hand for a given player
export function renderHand(player, isSpectator = false) {
  const handContainer = document.getElementById(`${player}-hand`);
  if (!handContainer) return;

  handContainer.innerHTML = ''; // Clear current hand

  const hand = duelState.players[player].hand;

  hand.forEach((card, index) => {
    const cardId = card.cardId || card.card_id || card; // supports ID strings or card objects
    const isFaceDown = card.isFaceDown || false;

    const cardElement = renderCard(cardId, isFaceDown);

    // Development: allow manual removal during testing
    if (!isSpectator) {
      cardElement.addEventListener('click', () => {
        if (confirm(`Discard this card from ${player}'s hand?`)) {
          duelState.players[player].hand.splice(index, 1);
          renderHand(player, isSpectator); // Re-render hand
        }
      });
    }

    handContainer.appendChild(cardElement);
  });
}
