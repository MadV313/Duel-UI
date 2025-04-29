function updateUI() {
  renderHand('player1');
  renderField('player1');
  renderDeck('player1');
  renderDiscard('player1');
  renderHP('player1');

  renderHand('player2');
  renderField('player2');
  renderDeck('player2');
  renderDiscard('player2');
  renderHP('player2');

  renderTurn();
}

function renderHand(player) {
  const handDiv = document.getElementById(`${player}-hand`);
  handDiv.innerHTML = '';

  duelState[player].hand.forEach((card, index) => {
    const cardImg = document.createElement('img');
    cardImg.src = `/images/cards/${card}`;
    cardImg.classList.add('card');
    cardImg.onclick = () => playCard(player, index);

    const discardBtn = document.createElement('button');
    discardBtn.innerText = 'Discard';
    discardBtn.onclick = (e) => {
      e.stopPropagation();
      discardCard(player, index);
    };

    const cardContainer = document.createElement('div');
    cardContainer.classList.add('card-container');
    cardContainer.appendChild(cardImg);
    cardContainer.appendChild(discardBtn);

    handDiv.appendChild(cardContainer);
  });
}

function renderField(player) {
  const fieldDiv = document.getElementById(`${player}-field`);
  fieldDiv.innerHTML = '';

  duelState[player].field.forEach((card) => {
    const cardImg = document.createElement('img');

    // Face-down logic for traps (simple placeholder logic)
    if (card.includes('Trap')) {
      cardImg.src = '/images/cards/000_CardBack_Unique.png';
    } else {
      cardImg.src = `/images/cards/${card}`;
    }

    cardImg.classList.add('card');
    fieldDiv.appendChild(cardImg);
  });
}

function renderDeck(player) {
  const deckDiv = document.getElementById(`${player}-deck`);
  deckDiv.innerHTML = `Draw Pile (${duelState[player].deck.length})`;
}

function renderDiscard(player) {
  const discardDiv = document.getElementById(`${player}-discard`);
  discardDiv.innerHTML = `Discard Pile (${duelState[player].discardPile.length})`;
}

function renderHP(player) {
  document.getElementById(`${player}-hp`).textContent = duelState[player].hp;
}

function renderTurn() {
  const turnDiv = document.getElementById('turn-display');
  turnDiv.innerHTML = `Current Turn: ${duelState.turn}`;
}
