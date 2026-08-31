import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));

const index = read('index.html');
const css = read('styles/style.css');
const app = read('scripts/sessionApp.js');
const client = read('scripts/sessionClient.js');
const config = read('scripts/config.js');

test('production domain contract', () => {
  assert.equal(read('CNAME').trim(), 'duel.sv13tcg.com');
  assert.match(config, /https:\/\/api\.sv13tcg\.com/);
  assert.match(config, /https:\/\/duel\.sv13tcg\.com/);
});

test('production index loads only the session-backed app', () => {
  assert.match(index, /scripts\/sessionApp\.js/);
  assert.doesNotMatch(index, /duelLoader\.js|loadPracticeDuel\.js|fetch-shim\.js|renderDuelUI\.js|scripts\/duel\.js/);
  assert.doesNotMatch(index, /src=["']\/scripts\//);
});

test('classic Duel UI DOM is restored', () => {
  for (const id of ['player2-hand','player2-field','player1-field','player1-hand','hp-display','turn-display','controls','endTurnBtn','coinFlipContainer','player1-discard-counter','player2-discard-counter']) {
    assert.match(index, new RegExp(`id=["']${id}["']`));
  }
});

test('classic deck/discard pseudo-piles and three-slot geometry are preserved', () => {
  assert.match(css, /#player1-hand::after/);
  assert.match(css, /#player2-hand::before/);
  assert.match(css, /#player1-hand::before/);
  assert.match(css, /#player2-hand::after/);
  assert.match(css, /000_WinterlandDeathDeck_Back\.png/);
  assert.match(app, /const MAX_FIELD_SLOTS = 3/);
  assert.match(app, /i < MAX_FIELD_SLOTS/);
});

test('manual Draw remains hidden and End Turn uses original body.duel-ready contract', () => {
  assert.match(css, /#drawBtn \{ display: none !important; \}/);
  assert.match(css, /body\.duel-ready #endTurnBtn/);
  assert.match(app, /document\.body\.classList\.add\('duel-ready'\)/);
  assert.match(app, /act\('end_turn'\)/);
});

test('session identity is session+token and legacy authorization params are not trusted', () => {
  const active = `${app}\n${client}\n${config}`;
  assert.match(config, /qs\.get\('session'\)/);
  assert.match(config, /qs\.get\('token'\)/);
  for (const forbidden of ["qs.get('player1')", 'qs.get("player1")', "qs.get('player2')", 'qs.get("player2")', 'opponentToken', "qs.get('role')", 'qs.get("role")']) {
    assert.equal(active.includes(forbidden), false, `must not trust legacy URL identity: ${forbidden}`);
  }
  assert.match(app, /const localSeat = view\.seat/);
});

test('canonical session state endpoint and discrete actions are used', () => {
  assert.match(client, /\/duel\/\$\{encodeURIComponent\(SESSION_ID\)\}\/state/);
  assert.match(client, /'X-Player-Token': PLAYER_TOKEN/);
  assert.match(client, /actionEndpoint\('action'\)/);
  assert.match(client, /action, parameters/);
  assert.doesNotMatch(`${index}\n${app}\n${client}`, /\/duel\/sync|summary\/save|trusted_snapshot/);
});

test('original turn semantics are restored through server actions', () => {
  assert.match(app, /sendAction\('start_turn'\)/);
  assert.match(app, /act\('play_card'/);
  assert.match(app, /act\('discard'/);
  assert.match(app, /act\('remove_field_card'/);
  assert.match(app, /act\('end_turn'\)/);
});

test('practice bot is explicit and never inferred from canonical player2 alone', () => {
  assert.match(client, /actionEndpoint\('bot-turn'\)/);
  assert.match(client, /view\.mode !== 'practice'/);
  assert.match(client, /remote\?\.controller !== 'bot'/);
  assert.match(app, /state\.mode !== 'practice'/);
  assert.match(app, /state\.remote\.controller !== 'bot'/);
  assert.doesNotMatch(app, /player2.*Practice Bot|Practice Bot.*player2/);
});

test('remote hand stays face-down and field traps honor face-down/fired state', () => {
  assert.match(app, /renderCard\(CARD_BACK, true\)/);
  assert.match(app, /isTrap\(entry\) && !isFired\(entry\)/);
});

test('revision polling is monotonic, reconnect-aware, and rate-limit conscious', () => {
  assert.match(client, /revision < lastRevision/);
  assert.match(client, /stale-state-ignored/);
  assert.match(client, /Retry-After/);
  assert.match(client, /maxPollBackoffMs/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /window\.addEventListener\('focus'/);
});

test('frontend never authors summaries and winner overlay uses server summary id', () => {
  assert.doesNotMatch(`${app}\n${client}`, /POST[^\n]*summary|summary\/save|buildSummary/);
  assert.match(index, /View Full Summary/);
  assert.match(app, /summaryUrl\(state\.id\)/);
});

test('viewer token is not persisted and production API query override stays disabled', () => {
  assert.doesNotMatch(`${app}\n${client}\n${config}`, /localStorage\.setItem\([^\n]*token/i);
  assert.match(config, /const devApi = isLocal \? validAbsoluteHttp\(qs\.get\('api'\)\) : ''/);
});

test('canonical card master remains authoritative', () => {
  const master = json('CoreMasterReference.json');
  const overlay = json('scripts/allCards.json');
  assert.equal(master.length, 128);
  assert.equal(overlay.length, 128);
  assert.match(read('scripts/allCards.js'), /CoreMasterReference\.json/);
  const boots = master.find(c => c.card_id === '034');
  assert.equal(boots?.name, 'Combat Boots');
  assert.match(String(boots?.logic_action || ''), /beartrap|tripwire/i);
});

test('failure state is explicit and preserves last confirmed board', () => {
  assert.match(index, /duel-error/);
  assert.match(index, /retrySessionBtn/);
  assert.match(app, /last confirmed board|last confirmed state/i);
});
