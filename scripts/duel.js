// duel.js — handles draw, discard, and turn logic
import { duelState } from './duelState.js';
import { updateDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import { allCards } from './allCards.js'; // ✅ Now using JS module instead of JSON assert

export async function drawCard() {
    const playerId = duelState.currentPlayer;
    const player = duelState.players[playerId];
    const deck = duelState[`deck${playerId === 'player1' ? '1' : '2'}`];

    if (player.hand.length >= 4) {
        alert("Hand full! Play or discard a card first.");
        return;
    }

    if (deck.length === 0) {
        alert("Deck empty! You suffer stamina loss!");
        player.hp -= 20;
        if (player.hp < 0) player.hp = 0;
        updateDuelUI();
        return;
    }

    const cardId = deck.shift();
    const cardData = allCards.find(card => card.cardId === cardId);
    if (!cardData) {
        console.warn(`Card ID ${cardId} not found in allCards.js`);
        return;
    }

    player.hand.push(cardData);
    console.log(`Player ${playerId} drew card: ${cardData.filename}`);

    // 🎒 Assault Backpack (Card #054)
    const hasAssaultBackpack = player.field.some(card => card.cardId === 54);
    if (hasAssaultBackpack && deck.length > 0 && player.hand.length < 4) {
        const bonusCardId = deck.shift();
        const bonusCardData = allCards.find(card => card.cardId === bonusCardId);
        if (bonusCardData) {
            player.hand.push(bonusCardData);
            console.log("Assault Backpack active: Drew extra card.");
            triggerAnimation('heal');
        }
    }

    // 🎒 Tactical Backpack (Card #056)
    const lootPile = duelState.lootPile || [];
    const hasTacticalBackpack = player.field.some(card => card.cardId === 56);
    if (hasTacticalBackpack && lootPile.length > 0 && player.hand.length < 4) {
        const lootCardId = lootPile.shift();
        const lootCardData = allCards.find(card => card.cardId === lootCardId);
        if (lootCardData) {
            player.hand.push(lootCardData);
            console.log("Tactical Backpack active: Drew bonus loot card.");
            triggerAnimation('heal');
        }
    }

    updateDuelUI();
}

export async function endTurn() {
    duelState.currentPlayer = duelState.currentPlayer === 'player1' ? 'bot' : 'player1';
    duelState.players[duelState.currentPlayer].hasDrawn = false;

    applyStartTurnBuffs();

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
    const discardPile = duelState[`discard${playerId === 'player1' ? '1' : '2'}`];

    if (cardIndex < 0 || cardIndex >= player.hand.length) {
        alert("Invalid card selection.");
        return;
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    discardPile.push(discardedCard);

    console.log(`Player ${playerId} discarded: ${discardedCard.filename || "Unnamed Card"}`);
    updateDuelUI();
}
