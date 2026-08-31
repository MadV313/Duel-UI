import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));

const index = read('index.html');
const app = read('scripts/sessionApp.js');
const client = read('scripts/sessionClient.js');
const config = read('scripts/config.js');

function stripSfx(card) {
  const { sfx, ...rest } = card;
  return rest;
}

test('production domain contract', () => {
  assert.equal(read('CNAME').trim(), 'duel.sv13tcg.com');
  assert.match(config, /https:\/\/api\.sv13tcg\.com/);
  assert.match(config, /https:\/\/duel\.sv13tcg\.com/);
});

test('production index loads session app and not legacy duel loader', () => {
  assert.match(index, /scripts\/sessionApp\.js/);
  assert.doesNotMatch(index, /duelLoader\.js|loadPracticeDuel\.js|fetch-shim\.js|renderDuelUI\.js/);
});

test('root-absolute module script bug is removed', () => {
  assert.doesNotMatch(index, /src=["']\/scripts\//);
});

test('new app accepts session+token and does not trust legacy identity params', () => {
  const active = `${app}\n${client}\n${config}`;
  assert.match(config, /qs\.get\('session'\)/);
  assert.match(config, /qs\.get\('token'\)/);
  for (const forbidden of ["qs.get('player1')", 'qs.get("player1")', "qs.get('player2')", 'qs.get("player2")', 'opponentToken', "qs.get('role')", 'qs.get("role")']) {
    assert.equal(active.includes(forbidden), false, `active production code must not trust legacy URL identity: ${forbidden}`);
  }
  // Canonical seat names remain valid internal server state; the viewer seat must come from view.seat.
  assert.match(app, /const localSeat = view\.seat/);
});

test('canonical player state endpoint is session-scoped', () => {
  assert.match(client, /\/duel\/\$\{encodeURIComponent\(SESSION_ID\)\}\/state/);
  assert.match(client, /'X-Player-Token': PLAYER_TOKEN/);
  assert.doesNotMatch(client, /state\?token=/);
});

test('actions are discrete and no snapshot sync is active', () => {
  assert.match(client, /actionEndpoint\('action'\)/);
  assert.match(client, /action, parameters/);
  const active = `${index}\n${app}\n${client}`;
  assert.doesNotMatch(active, /\/duel\/sync|summary\/save|trusted_snapshot/);
});

test('practice bot endpoint is explicit and mode/controller gated', () => {
  assert.match(client, /actionEndpoint\('bot-turn'\)/);
  assert.match(client, /view\.mode !== 'practice'/);
  assert.match(client, /remote\?\.controller !== 'bot'/);
});

test('PvP player2 is not hard-coded as a bot', () => {
  assert.doesNotMatch(app, /player2.*Practice Bot|Practice Bot.*player2/);
  assert.match(app, /remote\.controller === 'bot'/);
});

test('local player abstraction is present', () => {
  assert.match(index, /LOCAL_PLAYER/);
  assert.match(index, /REMOTE_PLAYER/);
  assert.match(app, /localSeat/);
  assert.match(app, /remoteSeat/);
  assert.match(app, /view\.seat/);
});

test('revision polling is monotonic and reconnect aware', () => {
  assert.match(client, /revision < lastRevision/);
  assert.match(client, /stale-state-ignored/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /window\.addEventListener\('focus'/);
});

test('polling is rate-limit conscious and backs off on failures', () => {
  assert.match(client, /Retry-After/);
  assert.match(client, /maxPollBackoffMs/);
  assert.match(client, /2 \*\* Math\.min\(consecutiveFailures, 4\)/);
  assert.match(client, /actionInFlight \|\| botInFlight/);
});

test('frontend does not author summaries', () => {
  const active = `${app}\n${client}`;
  assert.doesNotMatch(active, /POST[^\n]*summary|summary\/save|buildSummary/);
  assert.match(app, /View Full Summary|viewSummaryBtn/);
});

test('viewer token is not persisted in localStorage by active production code', () => {
  const active = `${app}\n${client}\n${config}`;
  assert.doesNotMatch(active, /localStorage\.setItem\([^\n]*token/i);
});

test('canonical master owns gameplay metadata and legacy file is SFX-only at runtime', () => {
  const master = json('CoreMasterReference.json');
  const overlay = json('scripts/allCards.json');
  assert.equal(master.length, 128);
  assert.equal(overlay.length, 128);
  const loader = read('scripts/allCards.js');
  assert.match(loader, /CoreMasterReference\.json/);
  assert.match(loader, /extra\?\.sfx \? \{ \.\.\.card, sfx: extra\.sfx \}/);
  // Known legacy metadata drift must not become authoritative merely because SFX lives there.
  const master68 = master.find(c => c.card_id === '068');
  const overlay68 = overlay.find(c => c.card_id === '068');
  assert.notEqual(master68.tags, overlay68.tags);
  assert.match(master68.tags, /trap_ready/);
});

test('legacy practice fixture is valid JSON for future explicit dev use', () => {
  const fixture = json('data/mock_practice_duel.json');
  assert.equal(fixture.currentPlayer, 'player1');
  assert.ok(fixture.players?.player1 && fixture.players?.player2);
});

test('Combat Boots metadata declares trap immunity', () => {
  const card = json('CoreMasterReference.json').find(c => c.card_id === '034');
  assert.equal(card?.name, 'Combat Boots');
  assert.match(String(card?.logic_action || ''), /beartrap|tripwire/i);
});

test('legacy effect engine does not contain a proven Combat Boots immunity handler', () => {
  const legacy = `${read('scripts/duel.js')}\n${read('scripts/renderDuelUI.js')}\n${read('scripts/buffTracker.js')}`;
  assert.doesNotMatch(legacy, /trap_immunity|beartrap|tripwire/i);
});

test('production failure UI and retry are explicit', () => {
  assert.match(index, /Duel service unavailable|duel-error/);
  assert.match(index, /retrySessionBtn/);
  assert.match(app, /last confirmed revision|last known board/i);
});


test('production API cannot be overridden by a query parameter', () => {
  assert.match(config, /const devApi = isLocal \? validAbsoluteHttp\(qs\.get\('api'\)\) : ''/);
  assert.doesNotMatch(config, /window\.USER_TOKEN/);
});

test('field rendering does not hide a fourth server-authoritative card', () => {
  assert.match(app, /const list = Array\.isArray\(cards\) \? cards : \[\]/);
  assert.doesNotMatch(app, /cards\.slice\(0, MAX_FIELD\)/);
});

test('summary and hub navigation do not append duel token', () => {
  assert.match(config, /return HUB_BASE/);
  assert.match(config, /u\.searchParams\.set\('duelId', sessionId\)/);
  assert.doesNotMatch(config, /summaryUrl[\s\S]{0,300}PLAYER_TOKEN/);
});
