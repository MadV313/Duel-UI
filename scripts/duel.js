// duel.js — handles draw, discard, and turn logic
import { duelState } from './duelState.js';
import { updateDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';

export async function drawCard() {
    const playerId = duelState.currentPlayer;
    const player = duelState.players[playerId];

    if (player.hand.length >= 4) {
        alert("Hand full! Play or discard a card first.");
        return;
    }

    if (duelState.deck.length === 0) {
        alert("Deck empty! You suffer stamina loss!");

        // Stamina Drain
        player.hp -= 20;
        if (player.hp < 0) player.hp = 0;

        updateDuelUI();
        return;
    }

    // Draw main card
    const drawnCard = duelState.deck.shift();
    player.hand.push(drawnCard);

    // Bonus from Assault Backpack (#054)
    if (player.field.includes('054') && duelState.deck.length > 0 && player.hand.length < 4) {
        const bonusCard = duelState.deck.shift();
        player.hand.push(bonusCard);
        console.log("Assault Backpack active: Drew extra card.");
    }

    // Bonus from Tactical Backpack (#056)
    if (player.field.includes('056') && duelState.lootPile.length > 0 && player.hand.length < 4) {
        const bonusLootCard = duelState.lootPile.shift();
        player.hand.push(bonusLootCard);
        console.log("Tactical Backpack active: Drew bonus loot card.");
    }

    updateDuelUI();
}

export async function endTurn() {
    // Switch turn
    duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'player2' : 'player1';
    duelState.players[duelState.currentPlayer].hasDrawn = false;

    // Apply any start-of-turn buffs
    applyStartTurnBuffs();

    updateDuelUI();
}

export async function discardCard(playerId, cardIndex) {
    const player = duelState.players[playerId];

    if (cardIndex < 0 || cardIndex >= player.hand.length) {
        alert("Invalid card selection.");
        return;
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    duelState.discardPile.push(discardedCard);

    console.log(`Player ${playerId} discarded a card: ${discardedCard.name || "Unnamed Card"}`);

    updateDuelUI();
}
