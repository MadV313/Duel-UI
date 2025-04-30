// renderCard.js — handles visual rendering of cards for hand/field
import cardsData from './CoreMasterReference.json';

// Fetch full card object by ID
export function getCardById(cardId) {
    return cardsData.find(card => card.card_id === cardId);
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
    } else {
        imageUrl = `images/cards/${cardData.image}`;
        cardName = cardData.name || '';
        cardElement.classList.add(cardData.type.toLowerCase()); // e.g. 'attack', 'defense'
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

    // Append
    cardElement.appendChild(cardImage);
    cardElement.appendChild(nameLabel);

    return cardElement;
}
