// renderHand.js — renders a player's hand
import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';

// Render the hand for a given player
export function renderHand(player, isSpectator = false) {
  const handContainer = document.getElementById(`${player}-hand`);
  if (!handContainer) return;

  handContainer.innerHTML = '';

  const hand = duelState.players[player]?.hand;

  console.log(`🖐️ Rendering hand for ${player}:`, hand);

  if (!Array.isArray(hand)) {
    console.warn(`⚠️ No hand array for ${player}`);
    return;
  }

  hand.forEach((card, index) => {
    const cardId = card.cardId || card.card_id || card;
    const isFaceDown = card.isFaceDown || false;

    const cardElement = renderCard(cardId, isFaceDown);

    if (!isSpectator) {
      cardElement.addEventListener('click', () => {
        if (confirm(`Discard this card from ${player}'s hand?`)) {
          duelState.players[player].hand.splice(index, 1);
          renderHand(player, isSpectator);
        }
      });
    }

    handContainer.appendChild(cardElement);
  });
}
