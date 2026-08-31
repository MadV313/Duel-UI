// scripts/sessionApp.js — production Duel UI for the DuelSession server model.
// The server owns canonical player seats/state. This UI always orients the viewer as LOCAL_PLAYER.

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
const MIN_FIELD_SLOTS = 3;
const CARD_BACK = '000';
const cardIndex = new Map(allCards.map(c => [String(c.card_id).padStart(3, '0'), c]));
let currentView = null;
let actionBusy = false;
let firstPaint = true;
let lastFieldFingerprint = '';
let botTimer = null;
let bootstrapping = true;

function pad3(value) {
  const raw = String(value ?? '000');
  const n = Number(raw);
  return Number.isFinite(n) ? String(n).padStart(3, '0') : raw.padStart(3, '0');
}

function cardMeta(id) {
  return cardIndex.get(pad3(id)) || null;
}

function cardId(entry) {
  if (entry && typeof entry === 'object') return pad3(entry.cardId ?? entry.id ?? entry.card_id ?? CARD_BACK);
  return pad3(entry);
}

function tags(meta) {
  if (!meta?.tags) return [];
  return (Array.isArray(meta.tags) ? meta.tags : String(meta.tags).split(','))
    .map(v => String(v).trim().toLowerCase()).filter(Boolean);
}

function isTrap(id) {
  const meta = cardMeta(id);
  const t = String(meta?.type || '').toLowerCase();
  return t === 'trap' || tags(meta).includes('trap') || (Number(pad3(id)) >= 106 && Number(pad3(id)) <= 120);
}

function placeholders(count) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }, () => CARD_BACK);
}

function orient(view) {
  if (!view || !['player1', 'player2'].includes(view.seat)) return null;
  const localSeat = view.seat;
  const remoteSeat = localSeat === 'player1' ? 'player2' : 'player1';
  const localPublic = view[localSeat] || {};
  const remotePublic = view[remoteSeat] || {};
  return {
    sessionId: view.id,
    revision: Number(view.revision || 0),
    mode: view.mode || 'pvp',
    status: view.status || 'unknown',
    turn: Number(view.turn || 0),
    localSeat,
    remoteSeat,
    current: view.currentPlayer === localSeat ? 'local' : (view.currentPlayer === remoteSeat ? 'remote' : null),
    winner: view.winner === localSeat ? 'local' : (view.winner === remoteSeat ? 'remote' : null),
    reason: view.reason || '',
    spectatorCount: Number(view.spectatorCount || 0),
    local: {
      name: localPublic.displayName || 'You',
      controller: localPublic.controller || 'human',
      hp: Number(localPublic.hp ?? 200),
      hand: Array.isArray(view.hand) ? view.hand.map(cardId) : [],
      handCount: Number(localPublic.handCount ?? (Array.isArray(view.hand) ? view.hand.length : 0)),
      deckCount: Number(localPublic.deckCount || 0),
      field: Array.isArray(localPublic.field) ? localPublic.field.map(cardId) : [],
      discard: Array.isArray(localPublic.discard) ? localPublic.discard.map(cardId) : [],
      deckName: localPublic.deckName || '',
    },
    remote: {
      name: remotePublic.displayName || 'Opponent',
      controller: remotePublic.controller || 'human',
      hp: Number(remotePublic.hp ?? 200),
      hand: placeholders(remotePublic.handCount),
      handCount: Number(remotePublic.handCount || 0),
      deckCount: Number(remotePublic.deckCount || 0),
      field: Array.isArray(remotePublic.field) ? remotePublic.field.map(cardId) : [],
      discard: Array.isArray(remotePublic.discard) ? remotePublic.discard.map(cardId) : [],
      deckName: remotePublic.deckName || '',
    },
  };
}

function setConnection(kind, message) {
  const box = $('connection-status');
  if (!box) return;
  box.className = `connection-status ${kind || ''}`.trim();
  box.textContent = message || '';
}

function setFatal(title, message, retry = true) {
  $('duel-shell')?.classList.add('duel-unavailable');
  const panel = $('duel-error');
  if (!panel) return;
  panel.classList.remove('hidden');
  $('duel-error-title').textContent = title;
  $('duel-error-message').textContent = message;
  $('retrySessionBtn').style.display = retry ? '' : 'none';
}

function clearFatal() {
  $('duel-shell')?.classList.remove('duel-unavailable');
  $('duel-error')?.classList.add('hidden');
}

function updateIdentityLabels(state) {
  $('local-name').textContent = state.local.name;
  $('remote-name').textContent = state.remote.name;
  $('local-hp').textContent = String(state.local.hp);
  $('remote-hp').textContent = String(state.remote.hp);
  $('local-discard-counter').textContent = `Discard: ${state.local.discard.length}`;
  $('remote-discard-counter').textContent = `Discard: ${state.remote.discard.length}`;
  $('local-deck-count').textContent = `Deck: ${state.local.deckName || 'Deck'} • ${state.local.deckCount}`;
  $('remote-deck-count').textContent = `Deck: ${state.remote.deckName || 'Deck'} • ${state.remote.deckCount}`;
  $('local-hand-label').textContent = `Your Hand — ${state.local.name} (${state.local.hand.length})`;
  $('remote-hand-label').textContent = `${state.remote.name}'s Hand (${state.remote.handCount})`;
  document.title = `SV13 Duel — ${state.local.name} vs ${state.remote.name}`;
}

function renderHand(containerId, cards, { local = false } = {}) {
  const host = $(containerId);
  if (!host) return;
  host.innerHTML = '';
  const list = Array.isArray(cards) ? cards : [];
  for (let i = 0; i < list.length; i++) {
    const id = cardId(list[i]);
    const faceDown = !local;
    const el = renderCard(id, faceDown);
    el.dataset.index = String(i);
    el.dataset.local = String(local);
    if (local) {
      el.classList.add('clickable');
      el.title = `${cardMeta(id)?.name || id}\nClick to choose Play or Discard`;
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        showActionMenu(el, i, id);
      });
    } else {
      el.classList.add('spectator');
    }
    host.appendChild(el);
  }
}

function renderField(containerId, cards, { remote = false } = {}) {
  const host = $(containerId);
  if (!host) return;
  host.innerHTML = '';
  // Render every server-authoritative field card. The old UI assumed three slots,
  // while the backend field limit is configurable and currently defaults to four.
  const list = Array.isArray(cards) ? cards : [];
  for (const raw of list) {
    const id = cardId(raw);
    // Until effect-state is server-authored, trap cards remain visually concealed on the field.
    // The current server payload does not expose a fired/revealed flag yet.
    const el = renderCard(id, isTrap(id));
    el.classList.add('spectator');
    el.dataset.remote = String(remote);
    host.appendChild(el);
  }
  while (host.children.length < MIN_FIELD_SLOTS) {
    const slot = document.createElement('div');
    slot.className = 'card slot-placeholder';
    slot.setAttribute('aria-hidden', 'true');
    host.appendChild(slot);
  }
}

function hideActionMenu() {
  const menu = $('card-action-menu');
  if (!menu) return;
  menu.classList.add('hidden');
  document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
}

function showActionMenu(cardEl, index, id) {
  if (!currentView || currentView.current !== 'local' || currentView.status !== 'live' || actionBusy) return;
  const menu = $('card-action-menu');
  if (!menu) return;
  document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  cardEl.classList.add('selected');
  const rect = cardEl.getBoundingClientRect();
  menu.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  menu.style.top = `${window.scrollY + rect.top - 8}px`;
  menu.dataset.index = String(index);
  menu.dataset.cardId = id;
  menu.classList.remove('hidden');
}

function controlsForState(state) {
  const live = state.status === 'live';
  const yourTurn = live && state.current === 'local';
  const localHuman = state.local.controller === 'human';
  // Hand/field limits are server policy. Do not duplicate a hard-coded client limit.
  $('drawBtn').disabled = actionBusy || !yourTurn || !localHuman || state.local.deckCount <= 0;
  $('endTurnBtn').disabled = actionBusy || !yourTurn || !localHuman;
  $('forfeitBtn').disabled = actionBusy || !live || !localHuman;

  const controllerLabel = state.remote.controller === 'bot' ? 'Practice Bot' : 'Human Opponent';
  $('mode-display').textContent = state.mode === 'practice' ? `Practice • ${controllerLabel}` : `PvP • ${controllerLabel}`;

  if (!live) {
    $('turn-display').textContent = state.status === 'finished' ? 'Duel finished' : `Session: ${state.status}`;
  } else if (state.current === 'local') {
    $('turn-display').textContent = `Turn ${state.turn} — Your move`;
  } else {
    $('turn-display').textContent = `Turn ${state.turn} — ${state.remote.name}'s move`;
  }
}

function maybePlayFieldFeedback(state) {
  const fp = `${state.revision}|${state.local.field.join(',')}|${state.remote.field.join(',')}`;
  if (firstPaint) {
    lastFieldFingerprint = fp;
    return;
  }
  if (fp === lastFieldFingerprint) return;
  const prev = lastFieldFingerprint;
  lastFieldFingerprint = fp;
  try {
    triggerAnimation('combo');
    const newest = [...state.local.field, ...state.remote.field].find(id => !prev.includes(id));
    if (newest) {
      const meta = cardMeta(newest);
      audio.playForCard(meta, 'place');
      triggerAnimationByCard(newest);
    }
  } catch {}
}

function render(state) {
  currentView = state;
  clearFatal();
  $('duel-shell')?.classList.add('duel-ready');
  setConnection('ok', `Connected • Revision ${state.revision}`);
  updateIdentityLabels(state);
  renderHand('local-hand', state.local.hand, { local: true });
  renderHand('remote-hand', state.remote.hand, { local: false });
  renderField('local-field', state.local.field, { remote: false });
  renderField('remote-field', state.remote.field, { remote: true });
  controlsForState(state);
  maybePlayFieldFeedback(state);
  firstPaint = false;

  if (state.status === 'finished') showWinner(state);
  else hideWinner();

  scheduleBotIfNeeded(state);
}

function showWinner(state) {
  const overlay = $('winner-overlay');
  if (!overlay) return;
  const localWon = state.winner === 'local';
  const draw = !state.winner;
  $('winner-title').textContent = draw ? 'Duel Complete' : (localWon ? 'Victory' : `${state.remote.name} Wins`);
  $('winner-reason').textContent = state.reason ? `Result: ${state.reason}` : 'Server-finalized duel result';
  const summary = $('viewSummaryBtn');
  summary.href = summaryUrl(state.sessionId);
  overlay.classList.remove('hidden');
}

function hideWinner() {
  $('winner-overlay')?.classList.add('hidden');
}

function scheduleBotIfNeeded(state) {
  clearTimeout(botTimer);
  if (state.status !== 'live' || state.mode !== 'practice' || state.current !== 'remote' || state.remote.controller !== 'bot') return;
  botTimer = setTimeout(async () => {
    try {
      setConnection('working', `${state.remote.name} is taking its turn…`);
      await runPracticeBotTurn();
    } catch (err) {
      setConnection('warn', `Practice bot turn failed: ${err.message}`);
    }
  }, 900);
}

async function act(action, parameters = {}) {
  if (actionBusy) return;
  actionBusy = true;
  hideActionMenu();
  if (currentView) controlsForState(currentView);
  setConnection('working', 'Submitting action…');
  try {
    await sendAction(action, parameters);
  } catch (err) {
    const msg = err instanceof SessionError ? err.message : 'Duel action failed.';
    setConnection('warn', msg);
    if (err?.status === 409) await retrySessionNow().catch(() => {});
  } finally {
    actionBusy = false;
    if (currentView) controlsForState(currentView);
  }
}

function bindControls() {
  $('drawBtn')?.addEventListener('click', () => act('draw'));
  $('endTurnBtn')?.addEventListener('click', () => act('end_turn'));
  $('forfeitBtn')?.addEventListener('click', () => {
    if (confirm('Forfeit this duel? This result is server-authoritative and cannot be undone.')) act('forfeit');
  });
  $('card-menu-play')?.addEventListener('click', () => {
    const menu = $('card-action-menu');
    const id = menu?.dataset.cardId;
    if (id) act('play_card', { cardId: id });
  });
  $('card-menu-discard')?.addEventListener('click', () => {
    const menu = $('card-action-menu');
    const id = menu?.dataset.cardId;
    if (id) act('discard', { cardId: id });
  });
  $('retrySessionBtn')?.addEventListener('click', async () => {
    setConnection('working', 'Reconnecting…');
    try { await retrySessionNow(); } catch (err) { showSessionFailure(err); }
  });
  document.addEventListener('click', ev => {
    if (!ev.target.closest('#card-action-menu') && !ev.target.closest('.card')) hideActionMenu();
  });
  window.addEventListener('resize', hideActionMenu);
  window.addEventListener('scroll', hideActionMenu, { passive: true });
}

function showSessionFailure(err) {
  const code = err?.code || '';
  if (code === 'invalid_link') return setFatal('Invalid duel link', 'Use the private duel link produced by DuelBot. It must contain both session and token.', false);
  if (code === 'invalid_player') return setFatal('Invalid player link', 'This token does not belong to a player in this duel. Open your own private DuelBot link.', false);
  if (code === 'session_not_found') return setFatal('Duel not found', 'This duel session no longer exists or the link is invalid.', false);
  setFatal('Duel service unavailable', 'The last known board has been preserved. Retry when the API is reachable.', true);
}

async function animateOpeningCoin(view) {
  const key = `sv13.duel.coinflip.seen:${SESSION_ID}`;
  let seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; } catch {}
  if (seen || view.status !== 'live') return;

  const state = orient(view);
  const overlay = $('announcement');
  const coin = $('coinFlipContainer');
  if (!state || !overlay || !coin) return;

  overlay.textContent = '🪙 Flipping…';
  overlay.classList.remove('hidden');
  coin.classList.remove('hidden');
  try { audio.coinFlip?.(); } catch {}
  await new Promise(r => setTimeout(r, 1400));
  overlay.textContent = state.current === 'local'
    ? `🪙 ${state.local.name} goes first!`
    : `🪙 ${state.remote.name} goes first!`;
  await new Promise(r => setTimeout(r, 900));
  overlay.classList.add('hidden');
  coin.classList.add('hidden');
  try { sessionStorage.setItem(key, '1'); } catch {}
}

async function boot() {
  bindControls();
  $('returnToHub').href = hubUrl();

  audio.configure({ bgSrc: 'audio/bg/Follow the Trail.mp3', sfxBase: 'audio/sfx/', bgVolume: 0.35, volume: 0.65 });
  audio.initAutoplayUnlock();
  installSoundToggleUI();

  if (!hasValidSessionIdentity()) {
    showSessionFailure(new SessionError('Invalid link', { code: 'invalid_link' }));
    setConnection('warn', 'No valid duel session loaded.');
    return;
  }

  setConnection('working', 'Connecting to duel session…');
  try {
    const initial = await fetchSessionState({ force: true });
    await animateOpeningCoin(initial);
    const state = orient(initial);
    if (!state) throw new SessionError('Invalid session payload.', { code: 'invalid_payload' });
    render(state);
    bootstrapping = false;
    startSessionPolling();
  } catch (err) {
    bootstrapping = false;
    showSessionFailure(err);
    setConnection('warn', err?.message || 'Unable to load duel.');
  }
}

onSessionEvent(evt => {
  if (evt.type === 'session-state' && evt.view) {
    if (bootstrapping) return;
    const state = orient(evt.view);
    if (state && (evt.changed || !currentView)) render(state);
    else if (state) setConnection('ok', `Connected • Revision ${state.revision}`);
  } else if (evt.type === 'connection-error') {
    if (currentView) setConnection('warn', 'Connection interrupted — showing last confirmed revision.');
    else showSessionFailure(evt.error);
  }
});

boot();
