// buffTracker.js — handles start-of-turn continuous buffs
import { duelState } from './duelState.js';
import { updateDuelUI } from './renderDuelUI.js';
import { triggerAnimation, triggerAnimationByCard } from './animations.js'; // ✅ Expanded

export function applyStartTurnBuffs() {
    const playerId = duelState.currentPlayer;
    const player = duelState.players[playerId];

    let buffTriggered = false;

    // --- Assault Backpack (#054) ---
    if (player.field.includes('054') && player.hand.length < 4 && duelState.deck.length > 0) {
        const bonusCard = duelState.deck.shift();
        player.hand.push(bonusCard);
        console.log("BuffTracker: Assault Backpack (#054) granted 1 extra card.");
        buffTriggered = true;

        // ✅ Optional visual test
        triggerAnimationByCard('054');
    }

    // --- Tactical Backpack (#056) ---
    if (player.field.includes('056') && player.hand.length < 4 && duelState.lootPile.length > 0) {
        const bonusLoot = duelState.lootPile.shift();
        player.hand.push(bonusLoot);
        console.log("BuffTracker: Tactical Backpack (#056) granted 1 bonus loot card.");
        buffTriggered = true;

        // ✅ Optional visual test
        triggerAnimationByCard('056');
    }

    // Optional: trigger generic animation if any buff was applied
    if (buffTriggered) {
        triggerAnimation('heal'); // 🌟 Visualize the buff with a healing aura
    }

    updateDuelUI();
}
