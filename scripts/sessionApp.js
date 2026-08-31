// scripts/sessionApp.js — Repo 8 repair.
// Keeps the original Duel UI/interaction model while the DuelSession API owns state and effects.

import allCards from './allCards.js';
import { renderCard } from './renderCard.js';
import { audio, installSoundToggleUI } from './audio.js';
import { triggerAnimation, triggerAnimationByCard } from './animations.js';
import { SESSION_ID, hubUrl, summaryUrl } from './config.js';
import {
  SessionError,
  fetchSessionState,
  hasValidSessionIdentity,
  onSessionEvent,
  retrySessionNow,
  runPracticeBotTurn,
  sendAction,
  startSessionPolling,
} from './sessionClient.js';

const $ = id => document.getElementById(id);
const MAX_FIELD_SLOTS = 3;
const CARD_BACK = '000';
const cardIndex = new Map(allCards.map(c => [pad3(c?.card_id), c]));

let current = null;
let previous = null;
let actionBusy = false;
let bootstrapping = true;
let botTimer = null;

function pad3(value) {
  const s = String(value ?? '').trim();
  if (/^\d+$/.test(s)) return s.padStart(3, '0').slice(-3);
  return s.padStart(3, '0');
}

function cardId(entry) {
  if (entry && typeof entry === 'object') return pad3(entry.cardId ?? entry.id ?? entry.card_id ?? CARD_BACK);
  return pad3(entry);
}

function cardMeta(entry) { return cardIndex.get(cardId(entry)) || null; }
function tagSet(meta) {
  return new Set((Array.isArray(meta?.tags) ? meta.tags : String(meta?.tags || '').split(','))
    .map(v => String(v).trim().toLowerCase()).filter(Boolean));
}
function isTrap(entry) {
  const meta = cardMeta(entry);
  const n = Number(cardId(entry));
  return String(meta?.type || '').toLowerCase() === 'trap' || tagSet(meta).has('trap') || (n >= 106 && n <= 120);
}
function isFaceDown(entry) {
  if (entry && typeof entry === 'object' && 'isFaceDown' in entry) return Boolean(entry.isFaceDown);
  return isTrap(entry);
}
function isFired(entry) {
  return Boolean(entry && typeof entry === 'object' && (entry._fired || entry.fired));
}

function orient(view) {
  if (!view || !['player1', 'player2'].includes(view.seat)) return null;
  const localSeat = view.seat;
  const remoteSeat = localSeat === 'player1' ? 'player2' : 'player1';
  const lp = view[localSeat] || {};
  const rp = view[remoteSeat] || {};
  return {
    raw: view,
    id: view.id,
    revision: Number(view.revision || 0),
    status: String(view.status || 'unknown'),
    mode: String(view.mode || 'pvp'),
    turn: Number(view.turn || 0),
    localSeat,
    remoteSeat,
    active: view.currentPlayer === localSeat ? 'local' : view.currentPlayer === remoteSeat ? 'remote' : null,
    winner: view.winner === localSeat ? 'local' : view.winner === remoteSeat ? 'remote' : null,
    reason: String(view.reason || ''),
    local: {
      name: lp.displayName || 'You',
      controller: lp.controller || 'human',
      hp: Number(lp.hp ?? 200),
      hand: Array.isArray(view.hand) ? view.hand : [],
      handCount: Number(lp.handCount ?? view.hand?.length ?? 0),
      deckCount: Number(lp.deckCount || 0),
      deckName: lp.deckName || '',
      field: Array.isArray(lp.field) ? lp.field : [],
      discard: Array.isArray(lp.discard) ? lp.discard : [],
    },
    remote: {
      name: rp.displayName || 'Opponent',
      controller: rp.controller || 'human',
      handCount: Number(rp.handCount || 0),
      deckCount: Number(rp.deckCount || 0),
      deckName: rp.deckName || '',
      hp: Number(rp.hp ?? 200),
      field: Array.isArray(rp.field) ? rp.field : [],
      discard: Array.isArray(rp.discard) ? rp.discard : [],
    },
  };
}

function setStatus(kind, text) {
  const el = $('session-status');
  if (!el) return;
  el.className = `session-status ${kind || ''}`.trim();
  el.textContent = text || '';
}

function showError(err) {
  const code = err?.code || '';
  let title = 'Duel service unavailable';
  let message = 'The last confirmed board is preserved. Retry when the API is reachable.';
  let retry = true;
  if (code === 'invalid_link') {
    title = 'Invalid duel link'; message = 'Use the private DuelBot link containing session and token.'; retry = false;
  } else if (code === 'invalid_player') {
    title = 'Invalid player link'; message = 'This token does not belong to a player in this duel.'; retry = false;
  } else if (code === 'session_not_found') {
    title = 'Duel not found'; message = 'This duel session no longer exists or the link is invalid.'; retry = false;
  }
  $('duel-error-title').textContent = title;
  $('duel-error-message').textContent = message;
  $('retrySessionBtn').style.display = retry ? '' : 'none';
  $('duel-error').classList.remove('hidden');
  setStatus('error', title);
}
function clearError() { $('duel-error')?.classList.add('hidden'); }

function appendCaption(host, text, where) {
  const cap = document.createElement('div');
  cap.className = `zone-caption zone-caption--${where}`;
  cap.textContent = text;
  host.appendChild(cap);
}

function renderHand(hostId, entries, { local }) {
  const host = $(hostId);
  if (!host) return;
  host.innerHTML = '';
  const count = local ? entries.length : Number(entries || 0);
  if (!local) {
    for (let i = 0; i < count; i++) host.appendChild(renderCard(CARD_BACK, true));
    appendCaption(host, `${current.remote.name} • Hand ${count} • Deck ${current.remote.deckCount}`, 'top');
    return;
  }

  entries.forEach((entry, index) => {
    const id = cardId(entry);
    const el = renderCard(id, false);
    el.classList.add('clickable');
    el.dataset.handIndex = String(index);
    el.title = `${cardMeta(id)?.name || id}\nClick to play. Hold Shift while clicking to discard.`;
    el.addEventListener('click', ev => {
      if (!canAct()) return;
      if (ev.shiftKey) return void confirmDiscard(id);
      confirmPlay(id);
    });
    host.appendChild(el);
  });
  appendCaption(host, `${current.local.name} • Hand ${entries.length} • Deck ${current.local.deckCount}`, 'bottom');
}

function renderField(hostId, entries, { local }) {
  const host = $(hostId);
  if (!host) return;
  host.innerHTML = '';
  const list = Array.isArray(entries) ? entries.slice(0, MAX_FIELD_SLOTS) : [];
  list.forEach((entry, index) => {
    const id = cardId(entry);
    const faceDown = isTrap(entry) && !isFired(entry) ? true : isFaceDown(entry);
    const el = renderCard(id, faceDown);
    el.dataset.fieldIndex = String(index);
    if (local) {
      el.classList.add('clickable');
      el.title = faceDown ? 'Your set trap\nClick to move it to discard.' : `${cardMeta(id)?.name || id}\nClick to move it to discard.`;
      el.addEventListener('click', () => confirmFieldRemove(id));
    } else {
      el.classList.add('spectator');
    }
    host.appendChild(el);
  });
  for (let i = list.length; i < MAX_FIELD_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'card slot-placeholder';
    slot.setAttribute('aria-hidden', 'true');
    host.appendChild(slot);
  }
}

function canAct() {
  return Boolean(current && current.status === 'live' && current.active === 'local' && current.local.controller === 'human' && !actionBusy);
}

async function confirmPlay(id) {
  if (!canAct()) return;
  const meta = cardMeta(id);
  if (!confirm(`Play ${meta?.name || id}?`)) return;
  await act('play_card', { cardId: id });
}
async function confirmDiscard(id) {
  if (!canAct()) return;
  const meta = cardMeta(id);
  if (!confirm(`Discard ${meta?.name || id} from your hand?`)) return;
  await act('discard', { cardId: id });
}
async function confirmFieldRemove(id) {
  if (!canAct()) return;
  const meta = cardMeta(id);
  if (!confirm(`Move ${meta?.name || id} from your field to discard?`)) return;
  await act('remove_field_card', { cardId: id });
}

function updateLabels(state) {
  $('player1-hp').textContent = String(state.local.hp);
  $('player2-hp').textContent = String(state.remote.hp);
  $('player1-discard-counter').textContent = `Discard: ${state.local.discard.length}`;
  $('player2-discard-counter').textContent = `Discard: ${state.remote.discard.length}`;
  if (state.status !== 'live') {
    $('turn-display').textContent = state.status === 'finished' ? 'Duel finished' : `Session: ${state.status}`;
  } else if (state.active === 'local') {
    $('turn-display').textContent = `Turn ${state.turn} — Your move`;
  } else {
    $('turn-display').textContent = `Turn ${state.turn} — ${state.remote.name}'s move`;
  }
  $('turn-display').classList.remove('hidden');
  document.title = `SV13 Duel — ${state.local.name} vs ${state.remote.name}`;
}

function updateControls(state) {
  const live = state.status === 'live';
  const yourTurn = live && state.active === 'local' && state.local.controller === 'human';
  // Draw remains hidden by CSS because original gameplay auto-draws exactly once at turn start.
  $('drawBtn').disabled = true;
  $('endTurnBtn').disabled = actionBusy || !yourTurn;
  $('forfeitBtn').disabled = actionBusy || !live || state.local.controller !== 'human';
}

function fieldSignature(list) {
  return (Array.isArray(list) ? list : []).map(x => `${cardId(x)}:${isFaceDown(x)}:${isFired(x)}`).join('|');
}

function playStateFeedback(prev, next) {
  if (!prev) return;
  try {
    if (next.local.hp < prev.local.hp || next.remote.hp < prev.remote.hp) {
      audio.play('attack_hit.mp3', { channel: 'hit', policy: 'overlap' });
      triggerAnimation('bullet');
    }
    const checks = [
      ['local', prev.local.field, next.local.field],
      ['remote', prev.remote.field, next.remote.field],
    ];
    for (const [, before, after] of checks) {
      if (fieldSignature(before) === fieldSignature(after)) continue;
      const beforeIds = before.map(cardId);
      const added = after.find(x => !beforeIds.includes(cardId(x)));
      if (added) {
        const meta = cardMeta(added);
        if (isTrap(added) && isFired(added)) audio.playTrapSfx(meta);
        else audio.playForCard(meta, 'place');
        triggerAnimationByCard(cardId(added));
      }
    }
    if (next.turn !== prev.turn) triggerAnimation('turn');
  } catch (err) {
    console.warn('[duel-ui] feedback error', err);
  }
}

function showWinner(state) {
  if (state.status !== 'finished') return $('winner-overlay')?.classList.add('hidden');
  const localWon = state.winner === 'local';
  $('winner-title').textContent = !state.winner ? 'Duel Complete' : localWon ? 'Victory' : `${state.remote.name} Wins`;
  $('winner-reason').textContent = state.reason ? `Result: ${state.reason}` : 'Server-finalized duel result.';
  $('viewSummaryBtn').href = summaryUrl(state.id);
  $('winner-overlay').classList.remove('hidden');
}

function render(state) {
  previous = current;
  current = state;
  clearError();
  document.body.classList.add('duel-ready');
  setStatus('ok', `${state.mode === 'practice' ? 'Practice' : 'PvP'} • Connected • Revision ${state.revision}`);
  updateLabels(state);
  renderHand('player2-hand', state.remote.handCount, { local: false });
  renderField('player2-field', state.remote.field, { local: false });
  renderField('player1-field', state.local.field, { local: true });
  renderHand('player1-hand', state.local.hand, { local: true });
  updateControls(state);
  playStateFeedback(previous, state);
  showWinner(state);
  scheduleBot(state);
}

function scheduleBot(state) {
  clearTimeout(botTimer);
  if (state.status !== 'live' || state.mode !== 'practice' || state.active !== 'remote' || state.remote.controller !== 'bot') return;
  botTimer = setTimeout(async () => {
    try {
      setStatus('working', `${state.remote.name} is taking its turn…`);
      await runPracticeBotTurn();
    } catch (err) {
      setStatus('warn', `Practice bot failed: ${err?.message || err}`);
    }
  }, 850);
}

async function act(action, parameters = {}) {
  if (actionBusy) return current;
  actionBusy = true;
  if (current) updateControls(current);
  setStatus('working', 'Submitting action…');
  try {
    return await sendAction(action, parameters);
  } catch (err) {
    setStatus('warn', err?.message || 'Action failed.');
    if (err?.status === 409) await retrySessionNow().catch(() => {});
    return current;
  } finally {
    actionBusy = false;
    if (current) updateControls(current);
  }
}

function bindControls() {
  $('endTurnBtn').addEventListener('click', () => canAct() && act('end_turn'));
  $('forfeitBtn').addEventListener('click', () => {
    if (current?.status === 'live' && confirm('Forfeit this duel?')) act('forfeit');
  });
  $('retrySessionBtn').addEventListener('click', async () => {
    setStatus('working', 'Reconnecting…');
    try { await retrySessionNow(); } catch (err) { showError(err); }
  });
}

async function animateCoinFlip(view) {
  const key = `sv13.duel.coinflip.seen:${SESSION_ID}`;
  let seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch {}
  if (seen || view?.status !== 'live') return;
  const state = orient(view);
  if (!state) return;
  const coin = $('coinFlipContainer');
  const ann = $('announcement');
  coin.style.display = 'flex';
  ann.textContent = '🪙 Flipping…';
  ann.classList.remove('hidden');
  try { audio.coinFlip(); } catch {}
  await new Promise(r => setTimeout(r, 1400));
  ann.textContent = state.active === 'local' ? `${state.local.name} goes first!` : `${state.remote.name} goes first!`;
  await new Promise(r => setTimeout(r, 900));
  ann.classList.add('hidden');
  coin.style.display = 'none';
  try { sessionStorage.setItem(key, '1'); } catch {}
}

async function ensureOpeningTurnStarted(view) {
  const state = orient(view);
  if (!state || state.status !== 'live') return view;
  // Bot endpoint starts its own turn authoritatively. Human opener asks the server
  // for the original one-time automatic start-of-turn draw. This action is idempotent.
  if (state.active === 'local') {
    try { return await sendAction('start_turn'); }
    catch (err) {
      if (err?.status !== 409) throw err;
    }
  }
  return view;
}

async function boot() {
  bindControls();
  $('returnToHub').href = hubUrl();
  audio.configure({ bgSrc: 'audio/bg/Follow the Trail.mp3', sfxBase: 'audio/sfx/', bgVolume: 0.35, volume: 0.65 });
  audio.initAutoplayUnlock();
  audio.startBg();
  installSoundToggleUI();

  if (!hasValidSessionIdentity()) {
    showError(new SessionError('Invalid link', { code: 'invalid_link', status: 400 }));
    return;
  }

  try {
    setStatus('working', 'Connecting to duel session…');
    let view = await fetchSessionState({ force: true });
    await animateCoinFlip(view);
    view = await ensureOpeningTurnStarted(view);
    const state = orient(view);
    if (!state) throw new SessionError('Invalid session payload.', { code: 'invalid_payload' });
    render(state);
    bootstrapping = false;
    startSessionPolling();
  } catch (err) {
    bootstrapping = false;
    showError(err);
  }
}

onSessionEvent(evt => {
  if (evt.type === 'session-state' && evt.view) {
    if (bootstrapping) return;
    const state = orient(evt.view);
    if (state && (evt.changed || !current)) render(state);
    else if (state) setStatus('ok', `${state.mode === 'practice' ? 'Practice' : 'PvP'} • Connected • Revision ${state.revision}`);
  } else if (evt.type === 'connection-error') {
    if (current) setStatus('warn', 'Connection interrupted — showing last confirmed state.');
    else showError(evt.error);
  }
});

boot();
