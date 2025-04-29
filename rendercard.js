// renderCard.js

import cardsData from './dayz_ccg_cards_with_000_all_fixed.json';

// Function to get the card details by ID
export function getCardById(cardId) {
    return cardsData.find(card => card.card_id === cardId);
}

// Function to render a card element (hand or field)
export function renderCard(cardId, isFaceDown = false) {
    const cardData = getCardById(cardId);

    // Create card container
    const cardElement = document.createElement('div');
    cardElement.classList.add('card');

    // Determine which image to show
    let imageUrl = '';
    let cardName = '';

    if (isFaceDown) {
        // Show WinterLand Death Deck image for face-down traps
        const faceDownCard = getCardById('000');
        imageUrl = faceDownCard.image ? `images/cards/${faceDownCard.image}` : '';
        cardName = ''; // Optionally leave blank or write "Face-Down Trap"
    } else {
        // Normal card image
        imageUrl = cardData.image ? `images/cards/${cardData.image}` : '';
        cardName = cardData.name || '';
    }

    // Create image element
    const cardImage = document.createElement('img');
    cardImage.src = imageUrl;
    cardImage.alt = cardName;
    cardImage.classList.add('card-image');

    // Create name label
    const nameLabel = document.createElement('div');
    nameLabel.classList.add('card-name');
    nameLabel.textContent = cardName;

    // Append elements
    cardElement.appendChild(cardImage);
    cardElement.appendChild(nameLabel);

    return cardElement;
}
