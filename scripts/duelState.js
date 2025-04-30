// duelState.js

export const duelState = {
  player1: {
    hp: 200,
    hand: [],
    field: [],
    deck: [],
    discardPile: [],
  },
  player2: {
    hp: 200,
    hand: [],
    field: [],
    deck: [],
    discardPile: [],
  },
  turn: 'player1', // player1 starts after coin flip unless switched
  winner: null,
};

export function initializeDecks() {
  // Placeholder decks with sample card numbers (replace with real deck logic later)
  for (let i = 1; i <= 30; i++) {
    duelState.player1.deck.push(`00${i}_CardName.png`);
    duelState.player2.deck.push(`00${i}_CardName.png`);
  }
}

export function drawCard(player) {
  if (duelState[player].deck.length === 0) return;
  if (duelState[player].hand.length >= 4) {
    alert(`${player} must play or discard a card before drawing!`);
    return;
  }
  const card = duelState[player].deck.shift();
  duelState[player].hand.push(card);
  renderDuelUI(); // instead of updateUI()
}

export function playCard(player, cardIndex) {
  if (duelState[player].field.length >= 4) {
    alert(`You can only have 4 cards on the field.`);
    return;
  }
  const card = duelState[player].hand.splice(cardIndex, 1)[0];
  duelState[player].field.push(card);
  renderDuelUI(); // instead of updateUI()
}

export function discardCard(player, cardIndex) {
  const card = duelState[player].hand.splice(cardIndex, 1)[0];
  duelState[player].discardPile.push(card);
  renderDuelUI(); // instead of updateUI()
}

export function endTurn() {
  duelState.turn = duelState.turn === 'player1' ? 'player2' : 'player1';
  renderDuelUI(); // instead of updateUI()
}

export function updateHP(player, amount) {
  duelState[player].hp += amount;
  if (duelState[player].hp <= 0) {
    duelState[player].hp = 0;
    duelState.winner = player === 'player1' ? 'player2' : 'player1';
    alert(`${duelState.winner} wins!`);
    // Here we would trigger the transition to the summary UI
  }
  renderDuelUI(); // instead of updateUI()
}
