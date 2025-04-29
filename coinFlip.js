function flipCoin() {
  const result = Math.random() < 0.5 ? 'player1' : 'player2';
  duelState.turn = result;
  alert(`${result === 'player1' ? 'Player 1' : 'Player 2'} wins the coin flip and goes first!`);
  updateUI();
}
