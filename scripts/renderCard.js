// renderCard.js — handles visual rendering of cards for hand/field
import allCards from './allCards.js';

// Fetch full card object by ID
export function getCardById(cardId) {
    const idStr = typeof cardId === 'number' ? String(cardId).padStart(3, '0') : cardId;
    return allCards.find(card => card.card_id === idStr);
}

// Render a card for hand or field
export function renderCard(cardId, isFaceDown = false) {
    const cardData = getCardById(cardId);

    const cardElement = document.createElement('div');
    cardElement.classList.add('card');

    let imageUrl = '';
    let cardName = '';

    if (isFaceDown) {
        const faceDownCard = getCardById('000');
        imageUrl = `images/cards/${faceDownCard.image}`;
        cardName = ''; // Optional: "Face-Down"
        cardElement.classList.add('face-down');
    } else if (cardData) {
        imageUrl = `images/cards/${cardData.image}`;
        cardName = cardData.name || '';
        cardElement.classList.add(cardData.type.toLowerCase()); // e.g. 'attack', 'defense', 'trap'
    } else {
        imageUrl = 'images/cards/000_WinterLand_Death_Deck.png';
        cardName = 'Unknown';
        cardElement.classList.add('unknown');
        console.warn(`Card ID ${cardId} not found in allCards.js`);
    }

    // Card image
    const cardImage = document.createElement('img');
    cardImage.src = imageUrl;
    cardImage.alt = cardName;
    cardImage.classList.add('card-image');

    // Name label
    const nameLabel = document.createElement('div');
    nameLabel.classList.add('card-name');
    nameLabel.textContent = cardName;

    cardElement.appendChild(cardImage);
    cardElement.appendChild(nameLabel);

    // Add visual effects based on tags
    if (!isFaceDown && cardData?.tags) {
        if (cardData.tags.includes('combo_sniper') || cardData.tags.includes('combo_buff')) {
            cardElement.classList.add('combo-glow');
        }
        if (cardData.tags.includes('fire') || cardData.tags.includes('explosion') || cardData.tags.includes('poison')) {
            cardElement.classList.add('damage-glow');
        }
    }

    return cardElement;
}
