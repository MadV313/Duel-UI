// scripts/sessionApp.js — session-backed Duel UI.
// DuelSession API remains authoritative; this file only orients the local view,
// renders the classic battlefield, submits discrete actions, and plays presentation FX.

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

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asCount(explicit, listLike) {
  const direct = Number(explicit);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  if (Array.isArray(listLike)) return listLike.length;
  const n = Number(listLike);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function playerDiscard(player) {
  return asList(player?.discard ?? player?.discardPile);
}

function playerDiscardCount(player) {
  return asCount(player?.discardCount, player?.discard ?? player?.discardPile);
}

function orient(view) {
  if (!view || !['player1', 'player2'].includes(view.seat)) return null;

  const localSeat = view.seat;
  const remoteSeat = localSeat === 'player1' ? 'player2' : 'player1';
  const lp = view[localSeat] || {};
  const rp = view[remoteSeat] || {};
  const localHand = asList(view.hand);
  const localDiscard = playerDiscard(lp);
  const remoteDiscard = playerDiscard(rp);

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
      name: lp.displayName || lp.discordName || lp.name || 'You',
      controller: lp.controller || 'human',
      hp: Number(lp.hp ?? 200),
      hand: localHand,
      handCount: asCount(lp.handCount, localHand),
      deckCount: asCount(lp.deckCount, lp.deck),
      deckName: lp.deckName || '',
      field: asList(lp.field),
      discard: localDiscard,
      discardCount: playerDiscardCount(lp),
    },
    remote: {
      name: rp.displayName || rp.discordName || rp.name || 'Opponent',
      controller: rp.controller || 'human',
      handCount: asCount(rp.handCount, rp.hand),
      deckCount: asCount(rp.deckCount, rp.deck),
      deckName: rp.deckName || '',
      hp: Number(rp.hp ?? 200),
      field: asList(rp.field),
      discard: remoteDiscard,
      discardCount: playerDiscardCount(rp),
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
    title = 'Invalid duel link';
    message = 'Use the private DuelBot link containing session and token.';
    retry = false;
  } else if (code === 'invalid_player') {
    title = 'Invalid player link';
    message = 'This token does not belong to a player in this duel.';
    retry = false;
  } else if (code === 'session_not_found') {
    title = 'Duel not found';
    message = 'This duel session no longer exists or the link is invalid.';
    retry = false;
  }

  $('duel-error-title').textContent = title;
  $('duel-error-message').textContent = message;
  $('retrySessionBtn').style.display = retry ? '' : 'none';
  $('duel-error').classList.remove('hidden');
  setStatus('error', title);
}

function clearError() {
  $('duel-error')?.classList.add('hidden');
}

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
    for (let i = 0; i < count; i++) {
      const el = renderCard(CARD_BACK, true);
      el.dataset.zone = 'hand';
      el.dataset.owner = 'remote';
      el.dataset.handIndex = String(i);
      host.appendChild(el);
    }
    appendCaption(host, `${current.remote.name} • Hand ${count}`, 'top');
    return;
  }

  entries.forEach((entry, index) => {
    const id = cardId(entry);
    const el = renderCard(id, false);
    el.classList.add('clickable');
    el.dataset.zone = 'hand';
    el.dataset.owner = 'local';
    el.dataset.handIndex = String(index);
    el.title = `${cardMeta(id)?.name || id}\nClick to play. Hold Shift while clicking to discard.`;
    el.addEventListener('click', ev => {
      if (!canAct()) return;
      if (ev.shiftKey) return void confirmDiscard(id);
      confirmPlay(id);
    });
    host.appendChild(el);
  });

  appendCaption(host, `${current.local.name} • Hand ${entries.length}`, 'bottom');
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
    el.dataset.zone = 'field';
    el.dataset.owner = local ? 'local' : 'remote';
    el.dataset.fieldIndex = String(index);

    if (local) {
      el.classList.add('clickable');
      el.title = faceDown
        ? 'Your set trap\nClick to move it to discard.'
        : `${cardMeta(id)?.name || id}\nClick to move it to discard.`;
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

function setPileState(id, count, label) {
  const pile = $(id);
  if (!pile) return;
  const n = Math.max(0, Number(count) || 0);
  pile.classList.toggle('is-empty', n <= 0);
  pile.dataset.count = String(n);
  const counter = pile.querySelector('.pile-counter');
  if (counter) counter.textContent = `${label}: ${n}`;
}

function renderPiles(state) {
  setPileState('player2-deck-pile', state.remote.deckCount, 'Deck');
  setPileState('player2-discard-pile', state.remote.discardCount, 'Discard');
  setPileState('player1-discard-pile', state.local.discardCount, 'Discard');
  setPileState('player1-deck-pile', state.local.deckCount, 'Deck');
}

function canAct() {
  return Boolean(
    current &&
    current.status === 'live' &&
    current.active === 'local' &&
    current.local.controller === 'human' &&
    !actionBusy
  );
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
  $('drawBtn').disabled = true;
  $('endTurnBtn').disabled = actionBusy || !yourTurn;
  $('forfeitBtn').disabled = actionBusy || !live || state.local.controller !== 'human';
}

function fieldSignature(list) {
  return (Array.isArray(list) ? list : []).map(x => `${cardId(x)}:${isFaceDown(x)}:${isFired(x)}`).join('|');
}

function ids(list) {
  return (Array.isArray(list) ? list : []).map(cardId);
}

function multisetDifference(before, after) {
  const remaining = new Map();
  for (const id of after || []) remaining.set(id, (remaining.get(id) || 0) + 1);
  const out = [];
  for (const id of before || []) {
    const n = remaining.get(id) || 0;
    if (n > 0) remaining.set(id, n - 1);
    else out.push(id);
  }
  return out;
}

function captureVisualSnapshot() {
  const cards = [];
  const roots = [
    ['local', 'hand', '#player1-hand .card:not(.slot-placeholder)'],
    ['local', 'field', '#player1-field .card:not(.slot-placeholder)'],
    ['remote', 'hand', '#player2-hand .card:not(.slot-placeholder)'],
    ['remote', 'field', '#player2-field .card:not(.slot-placeholder)'],
  ];

  for (const [owner, zone, selector] of roots) {
    document.querySelectorAll(selector).forEach(el => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      cards.push({
        owner,
        zone,
        id: el.dataset.cardId || CARD_BACK,
        rect,
        clone: el.cloneNode(true),
        used: false,
      });
    });
  }

  return { cards };
}

function takeCaptured(snapshot, owner, zones, id = null) {
  if (!snapshot?.cards) return null;
  const zoneSet = new Set(Array.isArray(zones) ? zones : [zones]);
  const wanted = id ? String(id) : null;
  let found = snapshot.cards.find(c => !c.used && c.owner === owner && zoneSet.has(c.zone) && (!wanted || c.id === wanted));
  if (!found && owner === 'remote' && zoneSet.has('hand')) {
    found = snapshot.cards.find(c => !c.used && c.owner === owner && c.zone === 'hand');
  }
  if (found) found.used = true;
  return found || null;
}

function pileRect(id) {
  const img = document.querySelector(`#${id} img`);
  const el = img || $(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
}

function targetCardRect(selector, preferLast = true) {
  const list = Array.from(document.querySelectorAll(selector));
  const el = preferLast ? list[list.length - 1] : list[0];
  if (!el) return { rect: null, el: null };
  const rect = el.getBoundingClientRect();
  return { rect: rect.width && rect.height ? rect : null, el };
}

function flyClone(clone, start, end, { duration = 520, rotate = 0, flip = false, target = null, bump = null } = {}) {
  if (!clone || !start || !end) return Promise.resolve();

  clone.classList.add('card-transition-clone');
  clone.style.position = 'fixed';
  clone.style.left = `${start.left}px`;
  clone.style.top = `${start.top}px`;
  clone.style.width = `${start.width}px`;
  clone.style.height = `${start.height}px`;
  clone.style.margin = '0';
  clone.style.zIndex = '18000';
  clone.style.pointerEvents = 'none';
  clone.style.transformOrigin = '50% 50%';
  document.body.appendChild(clone);

  if (target) target.classList.add('card-arrival-pending');

  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const sx = Math.max(.45, Math.min(1.2, end.width / Math.max(start.width, 1)));
  const sy = Math.max(.45, Math.min(1.2, end.height / Math.max(start.height, 1)));

  const midTransform = `translate3d(${dx * .55}px, ${dy * .45 - 20}px, 0) rotateZ(${rotate * .45}deg) rotateY(${flip ? 90 : 0}deg) scale(${(1 + sx) / 2}, ${(1 + sy) / 2})`;
  const endTransform = `translate3d(${dx}px, ${dy}px, 0) rotateZ(${rotate}deg) rotateY(${flip ? 180 : 0}deg) scale(${sx}, ${sy})`;

  const finish = () => {
    clone.remove();
    if (target) target.classList.remove('card-arrival-pending');
    if (bump) {
      bump.classList.remove('pile-bump');
      void bump.offsetWidth;
      bump.classList.add('pile-bump');
      setTimeout(() => bump.classList.remove('pile-bump'), 360);
    }
  };

  if (!clone.animate) {
    finish();
    return Promise.resolve();
  }

  const anim = clone.animate([
    { transform: 'translate3d(0,0,0) rotateZ(0deg) rotateY(0deg) scale(1)', opacity: 1 },
    { transform: midTransform, opacity: 1, offset: .58 },
    { transform: endTransform, opacity: .88 },
  ], { duration, easing: 'cubic-bezier(.2,.78,.2,1)', fill: 'forwards' });

  return anim.finished.catch(() => {}).finally(finish);
}

function animateDraw(owner, card, targetSelector) {
  const deckId = owner === 'local' ? 'player1-deck-pile' : 'player2-deck-pile';
  const start = pileRect(deckId);
  const { rect: end, el: target } = targetCardRect(targetSelector, true);
  if (!start || !end || !target) return;
  const clone = renderCard(CARD_BACK, true);
  flyClone(clone, start, end, { duration: 560, flip: owner === 'local', target });
}

function animateFieldArrival(snapshot, owner, id) {
  const captured = takeCaptured(snapshot, owner, 'hand', owner === 'remote' ? null : id);
  if (!captured) return;
  const selector = owner === 'local'
    ? `#player1-field .card[data-card-id="${id}"]`
    : `#player2-field .card[data-card-id="${id}"]`;
  const { rect: end, el: target } = targetCardRect(selector, true);
  if (!end) return;
  flyClone(captured.clone, captured.rect, end, { duration: 430, target });
}

function animateDiscard(snapshot, owner, id = null) {
  const pileId = owner === 'local' ? 'player1-discard-pile' : 'player2-discard-pile';
  const end = pileRect(pileId);
  if (!end) return;

  const captured = takeCaptured(snapshot, owner, ['field', 'hand'], id);
  const clone = captured?.clone || renderCard(CARD_BACK, true);
  const start = captured?.rect || (() => {
    const host = $(owner === 'local' ? 'player1-hand' : 'player2-hand');
    return host?.getBoundingClientRect() || null;
  })();

  if (!start) return;
  flyClone(clone, start, end, {
    duration: 520,
    rotate: owner === 'local' ? -180 : 180,
    flip: true,
    bump: $(pileId),
  });
}

function animateStateTransitions(prev, next, snapshot) {
  if (!prev || !next || !snapshot) return;

  try {
    const localBeforeHand = ids(prev.local.hand);
    const localAfterHand = ids(next.local.hand);
    const localAddedHand = multisetDifference(localAfterHand, localBeforeHand);

    if (next.local.handCount > prev.local.handCount && localAddedHand.length) {
      const drawn = localAddedHand[localAddedHand.length - 1];
      animateDraw('local', drawn, `#player1-hand .card[data-card-id="${drawn}"]`);
    }

    if (next.remote.handCount > prev.remote.handCount) {
      animateDraw('remote', CARD_BACK, '#player2-hand .card');
    }

    const localBeforeField = ids(prev.local.field);
    const localAfterField = ids(next.local.field);
    const remoteBeforeField = ids(prev.remote.field);
    const remoteAfterField = ids(next.remote.field);

    const localFieldAdded = multisetDifference(localAfterField, localBeforeField);
    const remoteFieldAdded = multisetDifference(remoteAfterField, remoteBeforeField);
    for (const id of localFieldAdded) animateFieldArrival(snapshot, 'local', id);
    for (const id of remoteFieldAdded) animateFieldArrival(snapshot, 'remote', id);

    const localDiscardDelta = Math.max(0, next.local.discardCount - prev.local.discardCount);
    const remoteDiscardDelta = Math.max(0, next.remote.discardCount - prev.remote.discardCount);

    if (localDiscardDelta > 0) {
      const localRemoved = [
        ...multisetDifference(localBeforeField, localAfterField),
        ...multisetDifference(localBeforeHand, localAfterHand),
      ];
      for (let i = 0; i < localDiscardDelta; i++) animateDiscard(snapshot, 'local', localRemoved[i] || null);
    }

    if (remoteDiscardDelta > 0) {
      const remoteRemoved = multisetDifference(remoteBeforeField, remoteAfterField);
      for (let i = 0; i < remoteDiscardDelta; i++) animateDiscard(snapshot, 'remote', remoteRemoved[i] || null);
    }
  } catch (err) {
    console.warn('[duel-ui] transition animation error', err);
  }
}

function playStateFeedback(prev, next) {
  if (!prev) return;

  try {
    const localDamage = next.local.hp < prev.local.hp;
    const remoteDamage = next.remote.hp < prev.remote.hp;

    // The hurt/hit SFX belongs to the local player only when THEIR HP actually drops.
    if (localDamage) {
      audio.play('attack_hit.mp3', { channel: 'hit', policy: 'overlap' });
      triggerAnimation('bullet');
    } else if (remoteDamage) {
      // Keep the visual impact without playing the local hurt cue when the opponent takes damage.
      triggerAnimation('bullet');
    }

    const checks = [
      [prev.local.field, next.local.field],
      [prev.remote.field, next.remote.field],
    ];

    for (const [before, after] of checks) {
      if (fieldSignature(before) === fieldSignature(after)) continue;
      const beforeIds = ids(before);
      const added = after.find(x => !beforeIds.includes(cardId(x)));
      if (!added) continue;
      const meta = cardMeta(added);
      if (isTrap(added) && isFired(added)) audio.playTrapSfx(meta);
      else audio.playForCard(meta, 'place');
      triggerAnimationByCard(cardId(added));
    }

    if (
      next.local.discardCount > prev.local.discardCount ||
      next.remote.discardCount > prev.remote.discardCount
    ) {
      audio.play('discard.mp3', { channel: 'discard', policy: 'restart' });
    }

    if (next.turn !== prev.turn) triggerAnimation('turn');
  } catch (err) {
    console.warn('[duel-ui] feedback error', err);
  }
}

function showWinner(state) {
  if (state.status !== 'finished') {
    $('winner-overlay')?.classList.add('hidden');
    return;
  }

  const localWon = state.winner === 'local';
  $('winner-title').textContent = !state.winner
    ? 'Duel Complete'
    : localWon
      ? 'Victory'
      : `${state.remote.name} Wins`;
  $('winner-reason').textContent = state.reason ? `Result: ${state.reason}` : 'Server-finalized duel result.';
  $('viewSummaryBtn').href = summaryUrl(state.id);
  $('winner-overlay').classList.remove('hidden');
}

function render(state) {
  const snapshot = current ? captureVisualSnapshot() : null;
  const prevState = current;
  previous = prevState;
  current = state;

  clearError();
  document.body.classList.add('duel-ready');
  setStatus('ok', `${state.mode === 'practice' ? 'Practice' : 'PvP'} • Connected • Revision ${state.revision}`);
  updateLabels(state);
  renderPiles(state);
  renderHand('player2-hand', state.remote.handCount, { local: false });
  renderField('player2-field', state.remote.field, { local: false });
  renderField('player1-field', state.local.field, { local: true });
  renderHand('player1-hand', state.local.hand, { local: true });
  updateControls(state);
  playStateFeedback(previous, state);
  showWinner(state);
  scheduleBot(state);

  if (prevState && snapshot) {
    requestAnimationFrame(() => animateStateTransitions(prevState, state, snapshot));
  }
}

function scheduleBot(state) {
  clearTimeout(botTimer);
  if (
    state.status !== 'live' ||
    state.mode !== 'practice' ||
    state.active !== 'remote' ||
    state.remote.controller !== 'bot'
  ) return;

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
  ann.textContent = state.active === 'local'
    ? `${state.local.name} goes first!`
    : `${state.remote.name} goes first!`;
  await new Promise(r => setTimeout(r, 900));
  ann.classList.add('hidden');
  coin.style.display = 'none';
  try { sessionStorage.setItem(key, '1'); } catch {}
}

async function ensureOpeningTurnStarted(view) {
  const state = orient(view);
  if (!state || state.status !== 'live') return view;

  // Bot endpoint starts the bot turn authoritatively. A human opener asks the server
  // for the original one-time automatic start-of-turn draw; this action is idempotent.
  if (state.active === 'local') {
    try {
      return await sendAction('start_turn');
    } catch (err) {
      if (err?.status !== 409) throw err;
    }
  }
  return view;
}

async function boot() {
  bindControls();
  $('returnToHub').href = hubUrl();
  audio.configure({
    bgSrc: 'audio/bg/Follow the Trail.mp3',
    sfxBase: 'audio/sfx/',
    bgVolume: 0.35,
    volume: 0.65,
  });
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
    else if (state) {
      setStatus('ok', `${state.mode === 'practice' ? 'Practice' : 'PvP'} • Connected • Revision ${state.revision}`);
    }
  } else if (evt.type === 'connection-error') {
    if (current) setStatus('warn', 'Connection interrupted — showing last confirmed state.');
    else showError(evt.error);
  }
});

boot();
