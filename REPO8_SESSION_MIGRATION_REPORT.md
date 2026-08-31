# SV13 TCG — Repo #8 Duel UI session migration

## Production contract
- UI: `https://duel.sv13tcg.com`
- API: `https://api.sv13tcg.com`
- Player link: `?session=<id>&token=<viewer>`
- Canonical read: `GET /duel/:session/state` authenticated with `X-Player-Token`
- Canonical action: `POST /duel/:session/action`
- Practice bot only: `POST /duel/:session/bot-turn`
- Summary is server-authored and viewed through the summary UI.

## Architecture changes
- Removed active dependence on `player1`, `player2`, `opponentToken`, and `role` URL parameters.
- The server resolves the viewer's canonical seat. The client maps it into `LOCAL_PLAYER` and `REMOTE_PLAYER` for display, including when the viewer is canonical `player2`.
- PvP remote players are never treated as bots. Bot automation runs only when `mode=practice`, the remote controller is explicitly `bot`, the session is live, and the server says it is the bot seat's turn.
- Production no longer POSTs whole duel snapshots or frontend-authored summaries.
- Session revision polling is monotonic, preserves the last confirmed board on connection failure, refreshes on focus/visibility return, applies exponential/`Retry-After` backoff during failure/rate limiting, and supports reconnect/resume from the same private link.
- Practice saved/random deck choice is honored upstream by Duel Bot when the unique session is created; the UI does not recreate or overwrite that choice. The session's deck name is surfaced in the UI for verification.
- Card metadata loads from `CoreMasterReference.json`, with `scripts/allCards.json` used only as a presentation/SFX overlay.
- Root-absolute module script dependencies were removed from `index.html` for GitHub Pages custom-domain deployment.
- Production API is pinned to `https://api.sv13tcg.com`; a query-string API override is accepted only on localhost development pages.
- Player token is not copied into legacy globals/localStorage. Session-state GET authenticates by header rather than repeating the token in the API URL.
- The old client assumed three field slots while Duel Bot's server policy is configurable and currently defaults to four. The new renderer displays every server-returned field card instead of silently hiding a fourth card.
- Card-back rendering now follows canonical card `000` metadata (`000_WinterlandDeathDeck_Back.png`) rather than the stale hard-coded filename.

## Backend/API contract verified during this audit
The current Duel Bot already exposes the session model required by this UI:
- session creation is server-side for challenge/practice;
- each player receives `?session=<id>&token=<their token>`;
- `GET /duel/:session/state` resolves the token to a canonical seat and returns only the viewer's hand identities;
- `POST /duel/:session/action` accepts discrete actions;
- practice bot turns are rejected outside practice mode;
- summaries are written by server finalization and summary POSTs are retired.

## Gameplay authority finding — required follow-up
The current Duel Bot session action API authoritatively supports `draw`, `play_card`, `discard`, `end_turn`, and `forfeit`, plus the practice-only bot turn. It does **not yet authoritatively apply the 127 card effects, HP deltas, trap fired/revealed state, buff state, or category-specific draw/discard effects**. The old Duel UI performed those effects locally and pushed whole snapshots through the legacy sync bridge.

For that reason this Repo #8 migration intentionally does not let the browser silently continue authoring those state changes. The legacy effect implementation remains in the repository for the planned 127-card effect certification/port, but it is no longer loaded by production `index.html`.

This means the session/network architecture can now be smoke-tested, but a full normal duel cannot yet be certified as feature-complete solely from the present backend action set. The authoritative card-effect engine is the next gameplay-hardening layer after the session cutover is proven.

### Face-down trap privacy finding
The current server player/spectator serialization returns field card IDs for both canonical seats. The new UI visually keeps trap cards face-down, but a face-down opponent trap ID is still present in the network payload. That is a **backend information-disclosure gap** for PvP/spectators, not something a browser renderer can securely hide. Before competitive PvP is considered hardened, the server serializer should represent concealed traps without exposing their card IDs to unauthorized viewers and expose a server-authored fired/revealed state when appropriate.

### Combat Boots known mismatch
Card 034 (`Combat Boots`) states: `Immune to trap cards tagged as beartrap or tripwire.` The audited legacy effect engine contains no proven handler for that immunity. This remains a required explicit case in the post-architecture card-effect QA/authoritative-engine pass.

### Canonical master vs legacy SFX file drift
`scripts/allCards.json` is not a safe gameplay-data authority. Six cards contain non-SFX drift compared with `CoreMasterReference.json`:
- 061 Binoculars — tags differ.
- 066 Headtorch — tags differ.
- 068 Tripwire — logic/tags differ, including canonical trap/face-down metadata.
- 087 Rope — tags differ.
- 117 Alarm Tripwire — image filename capitalization/spelling differs.
- 126 Lt. Col. Emil Boren — name/image Unicode spelling differs.

The new loader therefore takes gameplay metadata only from the canonical master and copies only the `sfx` property from the legacy overlay.

## Preserved but retired from production authority
The following files remain for the later effect port/reference but are no longer loaded by production `index.html` as authoritative networking/game-state modules:
- `scripts/duelLoader.js`
- `scripts/loadPracticeDuel.js`
- `scripts/duelState.js`
- `scripts/duel.js`
- `scripts/renderDuelUI.js`
- `scripts/renderHand.js`
- `scripts/renderField.js`
- `scripts/api.js`
- `scripts/api-base.js`
- `scripts/fetch-shim.js`

Do not delete the effect-heavy modules until their behavior is represented in the server-owned effect engine and the 127-card matrix has passed.

## Production smoke test gate
1. Practice random-deck session opens from the DuelBot link using only `session+token`.
2. Practice saved-deck session opens and shows the saved deck name supplied by the server.
3. Challenger and opponent each open their own private PvP links; each browser displays itself as `LOCAL_PLAYER` even though one is canonical player1 and the other canonical player2.
4. Both browsers see the same public HP/field/discard/turn data after an action and revision poll.
5. The opponent/PvP browser never starts practice bot automation.
6. Refresh/reopen either private session link and confirm it resumes the same session/revision rather than creating a new duel.
7. Invalid token shows an explicit invalid-player state and never falls back to another player.
8. Temporarily block the API and confirm the last confirmed board remains visible with connection-interrupted status; reconnect and confirm revisions continue.
9. Forfeit finalizes server-side and the winner overlay links to the full server-authored summary.
10. Verify GitHub Pages custom domain and HTTPS at `duel.sv13tcg.com`.
11. In PvP, inspect the network state payload for a face-down trap and confirm the known privacy gap before competitive release; this requires a backend serializer repair, not a UI-only change.

## Validation completed in this patch
- `npm test`: 21/21 contract tests pass.
- `node --check`: active production session/config/card-loader/render modules pass syntax validation.
- Canonical card master parses: 128 records.
- Legacy SFX overlay parses: 128 records.
- Static source scan confirms production `index.html` does not load the legacy challenge/practice/snapshot path.

Do not certify the 127 gameplay effects until the server action/effect engine owns the corresponding effect state and the dedicated 127-card QA pass is complete.
