// scripts/sessionClient.js — canonical DuelSession transport.
// The browser never creates a duel, chooses a canonical seat, or sends full snapshots.
// It retrieves a server-authored session view and submits discrete authenticated actions.

import { API_BASE, CONFIG, PLAYER_TOKEN, SESSION_ID, apiUrl } from './config.js';

const SESSION_RE = /^[A-Za-z0-9_-]{12,128}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

const listeners = new Set();
let pollTimer = null;
let inFlight = false;
let actionInFlight = false;
let botInFlight = false;
let lastRevision = -1;
let lastView = null;
let stopped = false;
let consecutiveFailures = 0;
let retryAfterUntil = 0;

export class SessionError extends Error {
  constructor(message, { status = 0, code = 'session_error', data = null, retryAfterMs = 0 } = {}) {
    super(message);
    this.name = 'SessionError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.retryAfterMs = Math.max(0, Number(retryAfterMs || 0));
  }
}

export function hasValidSessionIdentity() {
  return SESSION_RE.test(SESSION_ID) && TOKEN_RE.test(PLAYER_TOKEN);
}

export function getLastSessionView() {
  return lastView;
}

export function onSessionEvent(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(type, detail = {}) {
  const payload = { type, ...detail };
  for (const listener of listeners) {
    try { listener(payload); } catch (err) { console.warn('[session] listener error', err); }
  }
  try { window.dispatchEvent(new CustomEvent(`duel:${type}`, { detail: payload })); } catch {}
}

function requestHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    'X-Player-Token': PLAYER_TOKEN,
    ...extra,
  };
}

async function parseResponse(res) {
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
  if (!res.ok) {
    const message = (data && typeof data === 'object' && data.error) || `${res.status} ${res.statusText || ''}`.trim();
    let code = 'request_failed';
    if (res.status === 401 || res.status === 403) code = 'invalid_player';
    else if (res.status === 404) code = 'session_not_found';
    else if (res.status === 409) code = 'session_conflict';
    else if (res.status === 429) code = 'rate_limited';
    else if (res.status >= 500) code = 'service_unavailable';
    const retryHeader = String(res.headers.get('Retry-After') || '').trim();
    let retryAfterMs = 0;
    if (retryHeader) {
      const seconds = Number(retryHeader);
      if (Number.isFinite(seconds)) retryAfterMs = Math.max(0, seconds * 1000);
      else {
        const when = Date.parse(retryHeader);
        if (Number.isFinite(when)) retryAfterMs = Math.max(0, when - Date.now());
      }
    }
    throw new SessionError(message || 'Duel service request failed.', { status: res.status, code, data, retryAfterMs });
  }
  return data;
}

function stateEndpoint() {
  return apiUrl(`/duel/${encodeURIComponent(SESSION_ID)}/state`);
}

function actionEndpoint(name) {
  return apiUrl(`/duel/${encodeURIComponent(SESSION_ID)}/${name}`);
}

function validateView(view) {
  if (!view || typeof view !== 'object') throw new SessionError('Invalid session payload.', { code: 'invalid_payload' });
  if (String(view.id || '') !== SESSION_ID) throw new SessionError('Session payload did not match the requested duel.', { code: 'invalid_payload' });
  if (!['player1', 'player2'].includes(view.seat)) throw new SessionError('Server did not resolve a local player seat.', { code: 'invalid_payload' });
  if (!view.player1 || !view.player2) throw new SessionError('Session player data is incomplete.', { code: 'invalid_payload' });
  return view;
}

function acceptView(view, source = 'poll') {
  const validated = validateView(view);
  const revision = Number(validated.revision || 0);
  if (lastView && revision < lastRevision) {
    emit('stale-state-ignored', { view: validated, source, revision, lastRevision });
    return lastView;
  }
  const changed = revision !== lastRevision;
  lastView = validated;
  lastRevision = revision;
  consecutiveFailures = 0;
  retryAfterUntil = 0;
  emit('session-state', { view: validated, changed, source });
  return validated;
}

export async function fetchSessionState({ force = false } = {}) {
  if (!hasValidSessionIdentity()) {
    throw new SessionError('This duel link is missing a valid session or player token.', { code: 'invalid_link', status: 400 });
  }
  if (inFlight) return lastView;
  inFlight = true;
  try {
    const res = await fetch(stateEndpoint(), {
      method: 'GET',
      headers: requestHeaders(),
      cache: 'no-store',
    });
    return acceptView(await parseResponse(res), 'poll');
  } catch (err) {
    consecutiveFailures += 1;
    if (err?.retryAfterMs) retryAfterUntil = Math.max(retryAfterUntil, Date.now() + err.retryAfterMs);
    emit('connection-error', { error: err, failures: consecutiveFailures });
    throw err;
  } finally {
    inFlight = false;
  }
}

export async function sendAction(action, parameters = {}) {
  if (!hasValidSessionIdentity()) throw new SessionError('Invalid duel link.', { code: 'invalid_link', status: 400 });
  if (actionInFlight) throw new SessionError('Another duel action is still being processed.', { code: 'action_in_flight', status: 409 });
  actionInFlight = true;
  emit('action-start', { action });
  try {
    const res = await fetch(actionEndpoint('action'), {
      method: 'POST',
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token: PLAYER_TOKEN, action, parameters }),
      cache: 'no-store',
    });
    const payload = await parseResponse(res);
    if (!payload?.state) throw new SessionError('Action response did not include updated session state.', { code: 'invalid_payload' });
    const view = acceptView(payload.state, 'action');
    emit('action-complete', { action, view });
    return view;
  } catch (err) {
    emit('action-error', { action, error: err });
    throw err;
  } finally {
    actionInFlight = false;
  }
}

export async function runPracticeBotTurn() {
  const view = lastView;
  if (!view || botInFlight) return view;
  const localSeat = view.seat;
  const remoteSeat = localSeat === 'player1' ? 'player2' : 'player1';
  const remote = view[remoteSeat];
  if (view.mode !== 'practice' || remote?.controller !== 'bot' || view.currentPlayer !== remoteSeat || view.status !== 'live') return view;

  botInFlight = true;
  emit('bot-turn-start', {});
  try {
    const res = await fetch(actionEndpoint('bot-turn'), {
      method: 'POST',
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token: PLAYER_TOKEN }),
      cache: 'no-store',
    });
    const payload = await parseResponse(res);
    const updated = payload?.state ? acceptView(payload.state, 'bot-turn') : await fetchSessionState({ force: true });
    emit('bot-turn-complete', { view: updated });
    return updated;
  } catch (err) {
    emit('bot-turn-error', { error: err });
    throw err;
  } finally {
    botInFlight = false;
  }
}

function scheduleNextPoll() {
  if (stopped) return;
  clearTimeout(pollTimer);
  const base = document.hidden ? CONFIG.hiddenPollMs : CONFIG.pollMs;
  // Gentle exponential backoff keeps a dead/rate-limited API from being hammered.
  // A Retry-After response always wins over our local cadence.
  const backoff = consecutiveFailures > 0
    ? Math.min(CONFIG.maxPollBackoffMs, base * (2 ** Math.min(consecutiveFailures, 4)))
    : base;
  const retryAfterDelay = Math.max(0, retryAfterUntil - Date.now());
  pollTimer = setTimeout(pollOnce, Math.max(backoff, retryAfterDelay));
}

async function pollOnce() {
  if (stopped) return;
  if (actionInFlight || botInFlight) return scheduleNextPoll();
  try { await fetchSessionState(); } catch { /* connection state is emitted; retain last good board */ }
  scheduleNextPoll();
}

export function startSessionPolling() {
  stopped = false;
  clearTimeout(pollTimer);
  scheduleNextPoll();
}

export function stopSessionPolling() {
  stopped = true;
  clearTimeout(pollTimer);
  pollTimer = null;
}

export async function retrySessionNow() {
  return fetchSessionState({ force: true });
}

document.addEventListener('visibilitychange', () => {
  if (stopped) return;
  clearTimeout(pollTimer);
  if (!document.hidden) {
    fetchSessionState({ force: true }).catch(() => {}).finally(scheduleNextPoll);
  } else {
    scheduleNextPoll();
  }
});

window.addEventListener('focus', () => {
  if (!stopped) fetchSessionState({ force: true }).catch(() => {});
});

window.addEventListener('beforeunload', stopSessionPolling, { once: true });

try { console.log('[session] API', API_BASE, 'session?', Boolean(SESSION_ID), 'token?', Boolean(PLAYER_TOKEN)); } catch {}
