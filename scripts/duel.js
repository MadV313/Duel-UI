// duel.js — handles draw, discard, and turn logic
import { duelState } from './duelState.js';
import { updateDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';

export async function drawCard() {
    const playerId = duelState.currentPlayer;
    const player = duelState.players[playerId];

    if (player.hand.length >= 4) {
        alert("Hand full! Play or discard a card first.");
        return;
    }

    if (duelState.deck.length === 0) {
        alert("Deck empty! You suffer stamina loss!");
        player.hp -= 20;
        if (player.hp < 0) player.hp = 0;
        updateDuelUI();
        return;
    }

    const drawnCard = duelState.deck.shift();
    player.hand.push(drawnCard);
    console.log(`Player ${playerId} drew card: ${drawnCard.name}`);

    if (player.field.includes('054') && duelState.deck.length > 0 && player.hand.length < 4) {
        const bonusCard = duelState.deck.shift();
        player.hand.push(bonusCard);
        console.log("Assault Backpack active: Drew extra card.");
        triggerAnimation('heal');
    }

    if (player.field.includes('056') && duelState.lootPile.length > 0 && player.hand.length < 4) {
        const bonusLootCard = duelState.lootPile.shift();
        player.hand.push(bonusLootCard);
        console.log("Tactical Backpack active: Drew bonus loot card.");
        triggerAnimation('heal');
    }

    updateDuelUI();
}

export async function endTurn() {
    duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'bot' : 'player1';
    duelState.players[duelState.currentPlayer].hasDrawn = false;

    applyStartTurnBuffs();

    // If bot's turn, send duelState to backend
    if (duelState.currentPlayer === 'bot') {
        try {
            const response = await fetch('https://duel-bot-backend-production.up.railway.app/bot/turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(duelState),
            });

            if (!response.ok) throw new Error(`Bot turn error: ${response.status}`);
            const updatedState = await response.json();
            Object.assign(duelState, updatedState);
        } catch (err) {
            console.error('Bot turn failed:', err);
            alert("Bot turn failed. Check backend logs.");
        }
    }

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
