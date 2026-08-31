# SV13 TCG — Duel UI

Production duel client for the SV13 TCG DuelSession backend.

## Production contract

- UI: `https://duel.sv13tcg.com`
- API: `https://api.sv13tcg.com`
- Private player link: `?session=<id>&token=<viewer>`
- Session read: `GET /duel/:session/state` with `X-Player-Token`
- Player actions: `POST /duel/:session/action`
- Practice bot turn: `POST /duel/:session/bot-turn` (practice sessions only)

The browser does not decide whether it is player1 or player2. Duel Bot resolves the viewer's canonical seat from the token, and the UI maps that seat to `LOCAL_PLAYER`; the other seat becomes `REMOTE_PLAYER`.

## Session behavior

- PvP: both remote/local controllers are human. No practice-bot automation runs.
- Practice: the server-created session identifies the bot controller. The UI invokes the bot-turn endpoint only when that bot is actually the remote controller and it is the bot's turn.
- Saved vs random practice decks are chosen before the Duel UI opens and are preserved in server session state.
- Revision polling refreshes the board, rejects stale revisions, and keeps the last confirmed board visible during a connection interruption.
- Refreshing or reopening the same private session URL resumes that same server session.
- Duel summaries are server-authored. The UI only links to the summary after a finalized result.

## Card metadata and presentation

`CoreMasterReference.json` is the gameplay-metadata authority. `scripts/allCards.json` is retained only for its presentation/SFX overlay; non-SFX drift in that legacy file is intentionally ignored by the production loader.

The existing rendering, animation, audio, coin-flip, and legacy effect implementation files remain in the repository so their behavior can be referenced during the later 127-card authoritative effect port/QA.

## Important authority boundary

The current Duel Bot action engine owns session identity, turn order, hands/decks/fields/discards, revisioning, forfeit finalization, summaries, and PvP W/L finalization. It does **not yet** authoritatively implement the full 127-card effect set (damage, healing, buffs, trap resolution, etc.). Production `index.html` therefore does not load the old browser-authoritative snapshot/effect path.

See `REPO8_SESSION_MIGRATION_REPORT.md` for the audit findings and the required post-architecture gameplay QA.

## Local validation

```bash
npm test
node --check scripts/sessionApp.js
node --check scripts/sessionClient.js
```

The optional legacy Node static/proxy server remains in the repository for compatibility, but production hosting is intended to be GitHub Pages on the custom domain above.
