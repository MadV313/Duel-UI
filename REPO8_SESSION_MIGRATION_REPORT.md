# SV13 TCG — Repo #8 Duel UI session repair

## Production contract
- UI: `https://duel.sv13tcg.com`
- API: `https://api.sv13tcg.com`
- Player link: `?session=<id>&token=<viewer>`
- State: `GET /duel/:session/state`
- Action: `POST /duel/:session/action`
- Practice bot only: `POST /duel/:session/bot-turn`
- Summary remains server-authored.

## What this repair corrects
The first Repo #8 session migration proved the new session/identity transport, but its production page replaced too much of the established Duel UI and the Duel Bot action engine only moved cards between zones. That combination caused the exact live failures observed in practice: changed layout, missing deck/discard piles, visible manual Draw, missing End Turn behavior, bot card plays without HP/effect resolution, and no authoritative field cleanup.

This repair keeps the new server session architecture while restoring the original Duel UI gameplay contract.

### Duel-UI changes
- Restores the original hand/field/HP/turn/control DOM structure and original CSS geometry.
- Restores the original deck/discard pseudo-piles around each hand.
- Uses canonical card back `000_WinterlandDeathDeck_Back.png`.
- Restores the original three-slot field.
- Keeps manual Draw hidden; start-of-turn draw is server-authoritative and one-time.
- Restores End Turn by applying `duel-ready` to `body`, matching the original stylesheet contract.
- Restores click-to-play, Shift+click-to-discard, and click-field-to-remove interactions through discrete server actions.
- Keeps local/remote orientation from the server-resolved seat.
- Keeps bot automation practice-only and controller-gated. PvP never runs bot automation.
- Keeps reconnect/revision polling/backoff from the session client.
- Keeps frontend summary creation disabled; winner overlay opens the server summary.

### Required Duel-Bot companion patch
A UI-only repair cannot restore effects because the canonical session API owns HP and board state. The included Duel-Bot patch therefore ports the proven behavior from the original browser `duel.js` into the server action path.

It adds authoritative handling for:
- one-time start-of-turn auto draw;
- play/discard/remove-field/end-turn actions;
- original end-turn field cleanup;
- practice bot play + effect resolution + turn advance;
- direct damage, `10x2` damage, healing, draws, category draws, discard/steal, skip/draw-block, heal-block, basic field destruction, next-attack buffs, selected loot/infected behaviors, DOT state, and trap triggering;
- Combat Boots (`034`) immunity to Bear Trap/Tripwire and Combat Gloves (`040`) general trap immunity;
- fired/revealed trap state;
- three-slot field enforcement even if an older environment still has a four-slot config default;
- server finalization after HP reaches zero.

The companion route patch also redacts concealed opponent/spectator trap IDs from player-facing state payloads rather than merely hiding them visually.

## What remains intentionally outside this repair
The planned 127-card certification matrix is still required. This patch ports the original effect-family behavior and fixes the live architecture/game-loop regression; it does not claim every metadata sentence across all 127 cards is already individually certified. That QA remains the next gameplay validation pass after the normal duel loop is proven again.

## Deployment order
1. Update **Duel-Bot** with the files under `Duel-Bot/` in this patch and redeploy it first.
2. Confirm `https://api.sv13tcg.com/health` is still healthy.
3. Update **Duel-UI** with the files under `Duel-UI-main/` and let GitHub Pages deploy.
4. Start a **new** `/practice` session for the smoke test. Do not use the partially played session created by the broken action engine.

## Required live smoke test
1. `/practice` → Random Deck.
2. Confirm coin flip and the original classic layout: both hand zones, both three-slot fields, deck pile, discard pile, HP, End Turn.
3. If bot wins coin flip, confirm it auto-draws, plays one card, resolves its effect/HP delta when applicable, cleans up at turn edge, and returns control.
4. On your turn, confirm the automatic draw happened exactly once and the Draw button is not available.
5. Play an Attack card and confirm effect/HP changes immediately.
6. Click a local field card and confirm it can be moved to discard.
7. End Turn and confirm ephemeral Attack/Loot/Tactical/Infected cards clear while Defense and unfired Traps persist.
8. Refresh the same private session URL and confirm it resumes without an extra start-turn draw.
9. Forfeit once and confirm the server-finalized winner overlay opens the full summary.
10. Then run one saved-deck practice session.

## Validation performed before packaging
- Duel-UI contract suite: 15/15 passing.
- `node --check` passed for the replacement Duel UI app and all included Duel-Bot JS files.
- Server effect smoke tests passed for:
  - idempotent opening draw;
  - Derringer `028` = 20 damage from `10x2`;
  - original three-slot field cap;
  - end-turn cleanup + opponent auto-draw;
  - Combat Boots `034` blocking Bear Trap `106`;
  - practice bot card effect + turn return.
