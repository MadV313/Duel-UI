// scripts/renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import { API_BASE, UI_BASE } from './config.js';
import { audio, installSoundToggleUI } from './audio.js';

/* ---------------- constants ---------------- */
const MAX_HP = 200;
const MAX_FIELD_SLOTS = 3;
const MAX_HAND = 4;

const SLOW_MO_MS = 1000;
const MIN_TURN_MS = 7500;
const wait = (ms = SLOW_MO_MS) => new Promise(r => setTimeout(r, ms));

/* ---------------- small utils ---------------- */
const _qs = new URLSearchParams(location.search);
const PLAYER_TOKEN =
  _qs.get('token') ||
  (() => { try { return localStorage.getItem('sv13.token') || ''; } catch { return ''; } })();
try { if (PLAYER_TOKEN) localStorage.setItem('sv13.token', PLAYER_TOKEN); } catch {}

const API_OVERRIDE = (_qs.get('api') || '').replace(/\/+$/, '');
const HUB_BASE = _qs.get('hub') || (typeof window !== 'undefined' && window.HUB_UI_URL) || 'https://madv313.github.io/HUB-UI';

// Opponent token (multiplayer-ready; ignored for practice bot)
const OPP_TOKEN =
  _qs.get('token2') ||
  _qs.get('opptoken') ||
  _qs.get('opponentToken') ||
  _qs.get('partnerToken') ||
  '';

// Duel/session id (optional; used for spectators polling if present)
const DUEL_ID =
  _qs.get('duelId') ||
  _qs.get('duel') ||
  _qs.get('session') ||
  '';

function withTokenAndApi(url) {
  try {
    const u = new URL(url, location.origin);
    if (PLAYER_TOKEN) u.searchParams.set('token', PLAYER_TOKEN);
    if (API_OVERRIDE) u.searchParams.set('api', API_OVERRIDE);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    const parts = [];
    if (PLAYER_TOKEN) parts.push(`token=${encodeURIComponent(PLAYER_TOKEN)}`);
    if (API_OVERRIDE) parts.push(`api=${encodeURIComponent(API_OVERRIDE)}`);
    return parts.length ? `${url}${sep}${parts.join('&')}` : url;
  }
}
function authHeaders(extra = {}) {
  return {
    ...(PLAYER_TOKEN ? { 'X-Player-Token': PLAYER_TOKEN } : {}),
    ...extra,
  };
}

/* ---------------- allCards loader ---------------- */
let allCards = [];
let allCardsReady = false;
let allCardsLoading = null;

async function ensureAllCardsLoaded() {
  if (allCardsReady) return;
  if (allCardsLoading) { await allCardsLoading; return; }

  const CANDIDATES = [
    '/scripts/allCards.json',
    './scripts/allCards.json',
    './allCards.json',
    '/allCards.json',
  ];

  allCardsLoading = (async () => {
    let lastErr = null;
    for (const url of CANDIDATES) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        try {
          allCards = JSON.parse(text);
          allCardsReady = true;
          console.log('[UI] allCards loaded from', url, '→', Array.isArray(allCards) ? allCards.length : 0);
          return;
        } catch (e) {
          throw new Error(`Bad JSON from ${url}: ${text.slice(0, 80)}`);
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.error('[UI] Failed to load allCards.json from any candidate path:', lastErr);
    allCards = [];
    allCardsReady = true;
  })();

  await allCardsLoading;
}

/* ---------------- meta helpers ---------------- */
function pad3(id) { return String(id).padStart(3, '0'); }

function getMeta(cardId) {
  if (!allCardsReady) return null;
  const id = pad3(cardId);
  return allCards.find(c => c.card_id === id) || null;
}
function tagsOf(meta) {
  if (!meta) return [];
  return Array.isArray(meta.tags)
    ? meta.tags.map(t => String(t).toLowerCase().trim())
    : String(meta.tags || '')
        .split(',')
        .map(t => t.toLowerCase().trim())
        .filter(Boolean);
}
function hasTag(meta, ...tags) {
  if (!meta) return false;
  const set = new Set(tagsOf(meta));
  return tags.some(t => set.has(String(t).toLowerCase()));
}
function asInt(id) {
  const n = Number(String(id).replace(/\D/g, ''));
  return Number.isFinite(n) ? n : -1;
}
function isTrapIdByRange(cardId) {
  const n = asInt(cardId);
  return n >= 106 && n <= 120;
}
function isTrap(cardId) {
  const m = getMeta(cardId);
  const t = String(m?.type || '').toLowerCase();
  const name = String(m?.name || '').toLowerCase();
  if (t === 'trap') return true;
  if (hasTag(m, 'trap')) return true;
  if (/\btrap\b/.test(name)) return true;
  return isTrapIdByRange(cardId);
}
function looksInfected(meta) {
  if (!meta) return false;
  if (hasTag(meta, 'infected')) return true;
  return /infected/i.test(String(meta.name || ''));
}
function ensureArrays(p) {
  p.hand ||= [];
  p.field ||= [];
  p.deck ||= [];
  p.discardPile ||= [];
  p.buffs ||= {};
}
function changeHP(playerKey, delta) {
  const p = duelState?.players?.[playerKey];
  if (!p) return;
  p.hp = Math.max(0, Math.min(MAX_HP, Number(p.hp ?? 0) + Number(delta)));
}

/* ---------------- names via tokens ---------------- */
let fetchedNames = { player1: '', player2: '' };

async function fetchNameForToken(token) {
  if (!token) return '';
  const base = API_OVERRIDE || API_BASE;
  if (!base) return '';
  try {
    const r = await fetch(`${base}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
    if (!r.ok) return '';
    const s = await r.json();
    return (s.discordName || s.name || '').trim();
  } catch { return ''; }
}

async function initPlayerNames() {
  // Only query if we don't already have names
  const p1Existing = duelState?.players?.player1?.discordName || duelState?.players?.player1?.name || '';
  const p2Existing = duelState?.players?.player2?.discordName || duelState?.players?.player2?.name || '';

  const [n1, n2] = await Promise.all([
    p1Existing ? Promise.resolve(p1Existing) : fetchNameForToken(PLAYER_TOKEN),
    p2Existing ? Promise.resolve(p2Existing) : (OPP_TOKEN ? fetchNameForToken(OPP_TOKEN) : Promise.resolve('')),
  ]);

  fetchedNames.player1 = n1 || fetchedNames.player1 || '';
  fetchedNames.player2 = n2 || fetchedNames.player2 || '';

  try {
    duelState.players ||= {};
    duelState.players.player1 ||= {};
    duelState.players.player2 ||= {};
    if (fetchedNames.player1) {
      duelState.players.player1.discordName = fetchedNames.player1;
      duelState.players.player1.name = fetchedNames.player1;
    }
    if (fetchedNames.player2) {
      duelState.players.player2.discordName = fetchedNames.player2;
      duelState.players.player2.name = fetchedNames.player2;
    } else if (!OPP_TOKEN) {
      // practice bot
      duelState.players.player2.discordName ||= 'Practice Bot';
      duelState.players.player2.name ||= 'Practice Bot';
    }
  } catch {}
}

/* ---------- SFX compatibility: trap fire ---------- */
function playTrapSfx(trapMetaOrCard) {
  const meta = trapMetaOrCard?.cardId ? getMeta(trapMetaOrCard.cardId) : trapMetaOrCard;
  try {
    if (typeof audio.playTrapSfx === 'function') return audio.playTrapSfx(meta);
  } catch {}
  return audio.playForCard(meta, 'fire');
}

/* ---------- Human “place” SFX detector ---------- */
const _lastFieldCounts = { player1: new Map() };
const _firstSeenField = { player1: true };

function countByCardId(list) {
  const m = new Map();
  (list || []).forEach(e => {
    const id = pad3(e?.cardId ?? e?.id ?? e?.card_id ?? '000');
    if (!id || id === '000') return;
    m.set(id, (m.get(id) || 0) + 1);
  });
  return m;
}
function playPlaceSfxForNewFieldCards(playerKey = 'player1') {
  const P = duelState?.players?.[playerKey];
  if (!P) return;
  const curr = countByCardId(P.field);
  const prev = _lastFieldCounts[playerKey] || new Map();
  if (_firstSeenField[playerKey]) {
    _firstSeenField[playerKey] = false;
    _lastFieldCounts[playerKey] = curr;
    return;
  }
  for (const [id, now] of curr.entries()) {
    const was = prev.get(id) || 0;
    const delta = now - was;
    if (delta > 0) {
      const meta = getMeta(id);
      audio.playForCard(meta, 'place');
    }
  }
  _lastFieldCounts[playerKey] = curr;
}

/* ---------------- winner detection ---------------- */
function outOfCards(playerKey) {
  try {
    const P = duelState?.players?.[playerKey];
    if (!P) return false;
    return (Array.isArray(P.hand) ? P.hand.length : 0) === 0 &&
           (Array.isArray(P.deck) ? P.deck.length : 0) === 0;
  } catch { return false; }
}
function detectWinner() {
  try {
    if (duelState.winner) return duelState.winner;

    const p1 = Number(duelState?.players?.player1?.hp ?? MAX_HP);
    const p2 = Number(duelState?.players?.player2?.hp ?? MAX_HP);

    if (p1 <= 0 && p2 <= 0) {
      duelState.winner = 'player1';
    } else if (p1 <= 0) {
      duelState.winner = 'player2';
    } else if (p2 <= 0) {
      duelState.winner = 'player1';
    }

    if (!duelState.winner) {
      const p1Out = outOfCards('player1');
      const p2Out = outOfCards('player2');
      if (p1Out && p2Out) {
        duelState.winner = 'player1';
      } else if (p1Out) {
        duelState.winner = 'player2';
      } else if (p2Out) {
        duelState.winner = 'player1';
      }
    }

    if (duelState.winner) {
      duelState.started = true;
      try { renderZones?.(); } catch {}
    }
    return duelState.winner || null;
  } catch { return null; }
}

/* ---------------- draw helpers ---------------- */
function drawFor(playerKey) {
  const P = duelState?.players?.[playerKey];
  if (!P) return false;
  ensureArrays(P);
  if (P.hand.length >= MAX_HAND) return false;
  if (P.deck.length === 0) return false;
  const top = P.deck.shift();
  const entry = toEntry(top, playerKey === 'player2');
  P.hand.push(entry);
  return true;
}

/* ------------ lightweight picker (Walkie Talkie) ------------ */
function ensureOverlayRoot() {
  let el = document.getElementById('duel-overlay-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'duel-overlay-root';
    el.style.cssText = `
      position:fixed; inset:0; display:none; align-items:center; justify-content:center;
      background:rgba(0,0,0,0.6); z-index:9999;`;
    document.body.appendChild(el);
  }
  return el;
}
function presentCardPicker(cards, { title = 'Choose a card' } = {}) {
  return new Promise(resolve => {
    const root = ensureOverlayRoot();
    root.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = `
      background:#111; color:#eee; width:min(520px,90vw); max-height:70vh; overflow:auto;
      border-radius:12px; padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.5);`;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:600; margin-bottom:10px; font-size:18px;';
    const list = document.createElement('div');
    for (let i = 0; i < cards.length; i++) {
      const entry = cards[i];
      const cid = entry?.cardId ?? entry?.id ?? entry?.card_id ?? entry;
      const meta = getMeta(cid);
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText =
        'display:block;width:100%;text-align:left;padding:10px;border:1px solid #333;background:#1a1a1a;margin:6px 0;border-radius:8px;cursor:pointer;';
      row.textContent = `${pad3(cid)} — ${meta?.name || 'Unknown'}`;
      row.onclick = () => { root.style.display='none'; resolve({ index: i, card: entry }); };
      list.appendChild(row);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.type = 'button';
    cancel.style.cssText = 'margin-top:8px;padding:8px 12px;background:#333;color:#eee;border-radius:8px;border:1px solid #444;';
    cancel.onclick = () => { root.style.display='none'; resolve(null); };

    box.appendChild(h);
    box.appendChild(list);
    box.appendChild(cancel);
    root.appendChild(box);
    root.style.display = 'flex';
  });
}

/* -------------- Walkie Talkie swap -------------- */
async function runWalkieSwapFor(ownerKey, walkieFieldCard) {
  const P = duelState.players?.[ownerKey];
  if (!P) return;
  ensureArrays(P);
  if (!Array.isArray(P.discardPile) || P.discardPile.length === 0) return;
  if (!Array.isArray(P.hand) || P.hand.length === 0) return;

  const pickDiscard = await presentCardPicker(P.discardPile, { title: 'Pick a card FROM YOUR DISCARD' });
  if (!pickDiscard) return;
  const discardIdx = pickDiscard.index;

  const pickHand = await presentCardPicker(P.hand, { title: 'Pick a card FROM YOUR HAND to swap' });
  if (!pickHand) return;
  const handIdx = pickHand.index;

  const fromDiscard = P.discardPile.splice(discardIdx, 1)[0];
  const fromHand    = P.hand.splice(handIdx, 1, fromDiscard)[0];
  P.discardPile.push(fromHand);

  if (walkieFieldCard) {
    moveFieldCardToDiscard(ownerKey, walkieFieldCard);
  }

  renderZones();
  updateDiscardCounters();
}

/* ------ category draw ------ */
function drawFromDeckWhere(playerKey, predicate) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  if (P.hand.length >= MAX_HAND) return false;

  const idx = P.deck.findIndex(e => {
    const cid = (typeof e === 'object' && e !== null)
      ? (e.cardId ?? e.id ?? e.card_id)
      : e;
    const meta = getMeta(cid);
    return predicate(meta);
  });

  if (idx >= 0) {
    const [chosen] = P.deck.splice(idx, 1);
    P.hand.push(toEntry(chosen, playerKey === 'player2'));
    return true;
  }
  return drawFor(playerKey);
}
const isType  = t => meta => String(meta?.type || '').toLowerCase() === t;
const hasTagP = t => meta => hasTag(meta, t);

/* ---------------- discard / resolve helpers ---------------- */
function shouldAutoDiscard(meta) {
  if (!meta) return false;
  const tags = tagsOf(meta);
  if (tags.includes('discard_after_use') || tags.includes('consumable') || tags.includes('one_use')) return true;
  const effect = String(meta.effect || '').toLowerCase();
  const logic  = String(meta.logic_action || '').toLowerCase();
  const patterns = [
    /discard\s+this\s+card\s+(?:after|upon)\s+use/,
    /discard\s+after\s+use/,
    /use:\s*discard\s+this\s+card/,
    /then\s+discard\s+this\s+card/
  ];
  return patterns.some(rx => rx.test(effect) || rx.test(logic));
}
function moveFieldCardToDiscard(playerKey, cardObj) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const i = P.field.indexOf(cardObj);
  if (i !== -1) {
    const [c] = P.field.splice(i, 1);
    const meta = getMeta(c?.cardId);
    if (playerKey === 'player1') audio.playForCard(meta, 'discard');
    P.discardPile.push(c);
  }
}
function discardRandomTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const i = P.field.findIndex(c => c && isTrap(c.cardId));
  if (i !== -1) {
    const [c] = P.field.splice(i, 1);
    const meta = getMeta(c?.cardId);
    if (playerKey === 'player1') audio.playForCard(meta, 'discard');
    P.discardPile.push(c);
    return true;
  }
  return false;
}
function revealRandomEnemyTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const traps = P.field.filter(c => c && isTrap(c.cardId) && c.isFaceDown);
  if (traps.length) {
    const chosen = traps[Math.floor(Math.random() * traps.length)];
    chosen.isFaceDown = false;
    return true;
  }
  return false;
}
function destroyEnemyInfected(foeKey) {
  const P = duelState.players[foeKey];
  ensureArrays(P);
  const idx = P.field.findIndex(c => looksInfected(getMeta(c.cardId)));
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    const meta = getMeta(c?.cardId);
    if (foeKey === 'player1') audio.playForCard(meta, 'discard');
    P.discardPile.push(c);
    return true;
  }
  return false;
}

/* ---------- fired trap face-state persistence ---------- */
function firedTrapMarks() {
  duelState._pendingFiredTraps ||= [];
  return duelState._pendingFiredTraps;
}
function reapplyFiredTrapFaceState() {
  try {
    const marks = firedTrapMarks();
    for (const mark of marks) {
      const P = duelState.players?.[mark.owner];
      if (!P || !Array.isArray(P.field)) continue;
      const trap = P.field.find(c => c && isTrap(c.cardId) && c.cardId === mark.cardId);
      if (trap) {
        trap._fired = true;
        trap.isFaceDown = false;
      }
    }
  } catch {}
}

/* --------- text damage parsing --------- */
function damageFromText(effectText) {
  const s = String(effectText || '').toLowerCase();
  const mult = s.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (mult) return Number(mult[1]) * Number(mult[2]);
  const m = s.match(/deal[s]?\s+(\d+)\s*(?:dmg|damage)\b/);
  return m ? Number(m[1]) : 0;
}

/* ---------- persistence helper ---------- */
function isPersistentOnField(meta) {
  if (!meta) return false;
  const t = String(meta.type || '').toLowerCase();
  if (t === 'defense') return true;
  if (t === 'trap') return true;
  const tags = new Set(tagsOf(meta));
  return tags.has('persistent') || tags.has('equip') || tags.has('gear') || tags.has('armor');
}
function purgeFiredTraps(ownerKey) {
  const P = duelState.players?.[ownerKey];
  if (!P) return;
  ensureArrays(P);
  if (!Array.isArray(P.field) || P.field.length === 0) return;

  const keep = [];
  const moved = [];
  for (const card of P.field) {
    const rawId = card?.cardId ?? card?.id ?? card?.card_id;
    const cardId = rawId != null ? pad3(rawId) : null;
    const firedTrap = !!(card && cardId && isTrap(cardId) && card._fired);
    if (firedTrap) {
      moved.push({
        ...card,
        cardId,
        isFaceDown: false,
        _fired: false,
        _cleanupReason: 'firedTrap',
      });
    } else {
      keep.push(card);
    }
  }
  if (moved.length) {
    P.discardPile.push(...moved);
    try {
      const toRemove = new Set(moved.map(c => c.cardId));
      const marks = firedTrapMarks();
      duelState._pendingFiredTraps = marks.filter(
        m => !(m.owner === ownerKey && toRemove.has(pad3(m.cardId)))
      );
    } catch {}
    try { console.log('[purgeFiredTraps]', { owner: ownerKey, moved: moved.map(c => c.cardId) }); } catch {}
  }
  P.field = keep;
}
function cleanupEndOfTurnLocal(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  if (!Array.isArray(P.field) || !P.field.length) return;

  const keep = [];
  const toss = [];
  for (const card of P.field) {
    const meta = getMeta(typeof card === 'object' ? card.cardId : card);
    if (isTrap(card.cardId)) {
      if (card._fired) { card._cleanupReason = 'firedTrap'; toss.push(card); }
      else keep.push(card);
    } else if (isPersistentOnField(meta)) {
      keep.push(card);
    } else {
      card._cleanupReason = 'notPersistent';
      toss.push(card);
    }
  }
  try {
    const marks = firedTrapMarks();
    duelState._pendingFiredTraps = marks.filter(m => {
      if (m.owner !== playerKey) return true;
      return (P.field || []).some(c => c && isTrap(c.cardId) && c.cardId === m.cardId && c._fired);
    });
  } catch {}
  if (toss.length) {
    toss.forEach(c => {
      const meta = getMeta(c?.cardId);
      if (playerKey === 'player1') audio.playForCard(meta, 'discard');
    });
    P.discardPile.push(...toss);
    try { toss.forEach(c => console.log('[cleanup] moved to discard', { owner: playerKey, id: c.cardId, reason: c._cleanupReason || 'unknown' })); } catch {}
  }
  P.field = keep;
}

/* ---------- Trap activation ---------- */
async function triggerOneTrap(defenderKey) {
  const D = duelState.players[defenderKey];
  if (!D) return false;
  ensureArrays(D);

  const idx = D.field.findIndex(c => c && c.isFaceDown && isTrap(c.cardId));
  if (idx < 0) return false;

  const trap = D.field[idx];
  trap.isFaceDown = false;
  trap._fired = true;
  firedTrapMarks().push({ owner: defenderKey, cardId: trap.cardId });

  const meta = getMeta(trap.cardId);
  await wait(120);
  try { playTrapSfx(meta); } catch {}
  await wait(220);
  await resolveImmediateEffect(meta, defenderKey);
  try { console.log('[trap] fired', { owner: defenderKey, id: trap.cardId }); } catch {}
  return true;
}

/* --------------------- HIT-SFX suppression --------------------- */
function suppressGenericHit(ms = 300) {
  try { duelState._suppressHitSfxUntil = Date.now() + Number(ms || 0); } catch {}
}

/* -------------- Effect resolver -------------- */
async function resolveImmediateEffect(meta, ownerKey) {
  const you = ownerKey;
  const foe = ownerKey === 'player1' ? 'player2' : 'player1';

  const type  = String(meta?.type || '').toLowerCase();
  const name  = String(meta?.name || '').toLowerCase();
  const tags  = new Set(tagsOf(meta || {}));
  const isAtkOrInf =
    type === 'attack' ||
    type === 'infected' ||
    tags.has('infected') ||
    /\binfected\b/.test(name);

  if (isAtkOrInf) await triggerOneTrap(foe);
  if (!meta) return;

  const text = `${String(meta.effect || '')} ${String(meta.logic_action || '')}`.toLowerCase();

  const dmg = damageFromText(text);
  if (dmg > 0) {
    changeHP(foe, -dmg);
    await wait(90);
  }

  const mHeal = text.match(/(?:restore|heal)\s+(\d+)\s*hp?/);
  if (mHeal) {
    changeHP(you, +Number(mHeal[1]));
    audio.play('heal.mp3');
    await wait(90);
  }

  const mDraw = text.match(/draw\s+(a|\d+)\s+(?:card|cards)/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
    audio.play('draw.mp3');
    await wait(90);
  }

  if (/draw\s+1\s+loot\s+card/.test(text))     drawFromDeckWhere(you, isType('loot'));
  if (/draw\s+1\s+defense\s+card/.test(text))  drawFromDeckWhere(you, isType('defense'));
  if (/draw\s+1\s+tactical\s+card/.test(text)) drawFromDeckWhere(you, isType('tactical'));
  if (/draw\s+1\s+attack\s+card/.test(text))   drawFromDeckWhere(you, isType('attack'));
  if (/draw\s+1\s+trap\s+card/.test(text))     drawFromDeckWhere(you, (m) => isType('trap')(m) || hasTag(m, 'trap'));

  if (/skip\s+next\s+draw/.test(text)) {
    duelState.players[you].buffs ||= {};
    duelState.players[you].buffs.skipNextDraw = true;
  }

  if (/(?:destroy|remove)\s+(?:1\s+)?enemy(?:\s+field)?\s+card/.test(text)) {
    const foeField = duelState.players[foe].field || [];
    if (foeField.length) {
      const idx = /random/.test(text) ? Math.floor(Math.random() * foeField.length) : 0;
      const [destroyed] = foeField.splice(idx, 1);
      duelState.players[foe].discardPile ||= [];
      const dMeta = getMeta(destroyed?.cardId);
      if (foe === 'player1') audio.playForCard(dMeta, 'discard');
      duelState.players[foe].discardPile.push(destroyed);
      await wait(90);
    }
  }

  if (/(?:destroy|kill|remove)\s+(?:1\s+)?infected/.test(text)) {
    destroyEnemyInfected(foe);
  }

  if (/(?:disarm|disable|destroy)\s+(?:an?\s+)?trap/.test(text)) discardRandomTrap(foe);
  if (/(?:reveal|expose)\s+(?:an?\s+)?trap/.test(text)) revealRandomEnemyTrap(foe);

  try {
    suppressGenericHit(300);
    await audio.playForCard(meta, 'resolve', { channel: 'combat' });
  } catch {}
  await wait(90);

  detectWinner();
}

/** Resolve newly-placed bot non-traps once. */
async function resolveBotNonTrapCardsOnce() {
  const bot = duelState?.players?.player2;
  if (!bot || !Array.isArray(bot.field)) return;
  for (const card of bot.field.slice()) {
    if (duelState.winner) break;
    if (card && !card.isFaceDown && !isTrap(card.cardId) && !card._resolvedByUI) {
      const meta = getMeta(card.cardId);
      await resolveImmediateEffect(meta, 'player2');
      card._resolvedByUI = true;
    }
  }
}
/** Resolve newly-placed human non-traps once. */
async function resolveHumanNonTrapCardsOnce() {
  const human = duelState?.players?.player1;
  if (!human || !Array.isArray(human.field)) return;

  for (const card of human.field.slice()) {
    if (duelState.winner) break;
    if (card && !card.isFaceDown && !isTrap(card.cardId) && !card._resolvedByUI) {
      const meta = getMeta(card.cardId);
      try { await audio.playForCard(meta, 'place', { channel: 'ui' }); } catch {}
      await wait(140);

      const n = String(meta?.name || '').toLowerCase();
      const text = `${String(meta?.effect || '')} ${String(meta?.logic_action || '')}`.toLowerCase();
      if (n.includes('walkie') || /swap\s+one\s+card/.test(text)) {
        await runWalkieSwapFor('player1', card);
        card._resolvedByUI = true;
        continue;
      }
      await resolveImmediateEffect(meta, 'player1');
      card._resolvedByUI = true;

      if (shouldAutoDiscard(meta)) moveFieldCardToDiscard('player1', card);
    }
  }
}

/* ---------------- Bot auto-play assist ---------------- */
async function botAutoPlayAssist() {
  const bot = duelState?.players?.player2;
  if (!bot) return false;
  ensureArrays(bot);

  const fieldHasRoom = () => Array.isArray(bot.field) && bot.field.length < MAX_FIELD_SLOTS;

  const playOne = async (entry, faceDownHint) => {
    if (duelState.winner) return false;
    const idx = bot.hand.findIndex(h => (h.cardId ?? h) === (entry.cardId ?? entry));
    if (idx === -1 || !fieldHasRoom()) return false;
    const [card] = bot.hand.splice(idx, 1);

    const cid = (typeof card === 'object' && card !== null)
      ? (card.cardId ?? card.id ?? card.card_id)
      : card;

    const final = { cardId: pad3(cid), isFaceDown: !!faceDownHint };
    if (isTrap(final.cardId)) final.isFaceDown = true;

    bot.field.push(final);
    console.log('[bot] place', { id: final.cardId, faceDown: final.isFaceDown });
    renderZones();
    await wait();

    try { await audio.playForCard(getMeta(final.cardId), 'place', { channel: 'ui' }); } catch {}

    duelState._uiPlayedThisTurn ||= [];
    duelState._uiPlayedThisTurn.push({ cardId: final.cardId, isFaceDown: final.isFaceDown });

    const meta = getMeta(final.cardId);

    if (!final.isFaceDown) {
      await resolveImmediateEffect(meta, 'player2');
      final._resolvedByUI = true;
      setHpText();
      await wait();
    } else {
      await wait();
    }

    return true;
  };

  if (!fieldHasRoom()) return false;

  const iNT = bot.hand.findIndex(e => {
    const cid = (typeof e === 'object' && e !== null) ? (e.cardId ?? e.id ?? e.card_id) : e;
    return !isTrap(cid);
  });
  if (iNT !== -1) return await playOne(bot.hand[iNT], false);

  const iTrap = bot.hand.findIndex(e => {
    const cid = (typeof e === 'object' && e !== null) ? (e.cardId ?? e.id ?? e.card_id) : e;
    return isTrap(cid);
  });
  if (iTrap !== -1) return await playOne(bot.hand[iTrap], true);

  return false;
}

/* ------------------ display helpers ------------------ */
function nameOf(playerKey) {
  const p = duelState?.players?.[playerKey] || {};
  // Prefer fetched/populated names
  return p.discordName || p.name || (playerKey === 'player2' ? 'Practice Bot' : 'Challenger');
}
function setTurnText() {
  const el = document.getElementById('turn-display');
  if (!el) return;

  if (!duelState?.started && !duelState?.winner) {
    el.classList.add('hidden');
    return;
  }
  el.style.display = '';

  if (duelState.winner) {
    const winnerKey = duelState.winner;
    el.textContent = `Winner: ${nameOf(winnerKey)}`;
    el.classList.remove('hidden');
    return;
  }

  const who = duelState.currentPlayer;
  const label = who === 'player1' ? 'Challenger' : 'Opponent';
  el.textContent = `Turn: ${label} — ${nameOf(who)}`;
  el.classList.remove('hidden');
}
function setHpText() {
  const p1hpEl = document.getElementById('player1-hp');
  const p2hpEl = document.getElementById('player2-hp');
  if (p1hpEl) p1hpEl.textContent = duelState.players.player1.hp;
  if (p2hpEl) p2hpEl.textContent = duelState.players.player2.hp;

  const hpWrap = document.getElementById('hp-display');
  try {
    const rows = hpWrap?.querySelectorAll('div');
    if (rows && rows[0]) {
      rows[0].innerHTML = `Challenger (${nameOf('player1')}) HP: <span id="player1-hp">${duelState.players.player1.hp}</span>`;
    }
    if (rows && rows[1]) {
      rows[1].innerHTML = `Opponent (${nameOf('player2')}) HP: <span id="player2-hp">${duelState.players.player2.hp}</span>`;
    }
  } catch {}
}

/* --------- discard counter helpers --------- */
function counterId(player) { return `${player}-discard-counter`; }
function ensureCounterNode(afterNode, playerLabel = '') {
  if (!afterNode || !afterNode.parentElement) return null;
  const id = counterId(afterNode.id.replace('-hand',''));
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'discard-counter';
    afterNode.insertAdjacentElement('afterend', el);
  }
  if (playerLabel) el.dataset.playerLabel = playerLabel;
  return el;
}
function updateDiscardCounters() {
  try {
    const p1 = duelState?.players?.player1;
    const p2 = duelState?.players?.player2;
    ensureArrays(p1 || {});
    ensureArrays(p2 || {});
    const p1Hand = document.getElementById('player1-hand');
    const p2Hand = document.getElementById('player2-hand');
    const c1 = ensureCounterNode(p1Hand, 'player1');
    const c2 = ensureCounterNode(p2Hand, 'player2');
    if (c1) c1.textContent = `Discard: ${Array.isArray(p1.discardPile) ? p1.discardPile.length : 0}`;
    if (c2) c2.textContent = `Discard: ${Array.isArray(p2.discardPile) ? p2.discardPile.length : 0}`;
  } catch (e) {
    console.warn('[discard-counter] update failed:', e);
  }
}

/* ------------------ state normalizers ------------------ */
function asIdString(id) { return pad3(id); }
function toEntry(objOrId, defaultFaceDown = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return {
      cardId: asIdString(cid),
      isFaceDown: Boolean(objOrId.isFaceDown ?? defaultFaceDown),
      _fired: Boolean(objOrId._fired || false),
    };
  }
  return { cardId: asIdString(objOrId), isFaceDown: Boolean(defaultFaceDown), _fired: false };
}
function toFieldEntry(objOrId) {
  const base = toEntry(objOrId, false);
  if (isTrap(base.cardId)) {
    base.isFaceDown = base._fired ? false : true;
  } else {
    base.isFaceDown = false;
  }
  return base;
}
function normalizePlayerForServer(p) {
  if (!p) return { hp: MAX_HP, hand: [], field: [], deck: [], discardPile: [] };
  return {
    hp: Number(p.hp ?? MAX_HP),
    hand: Array.isArray(p.hand) ? p.hand.map(e => toEntry(e, false)) : [],
    field: Array.isArray(p.field) ? p.field.map(e => toEntry(e, false)) : [],
    deck: Array.isArray(p.deck) ? p.deck.map(e => toEntry(e, false)) : [],
    discardPile: Array.isArray(p.discardPile) ? p.discardPile.map(e => toEntry(e, false)) : [],
    discordName: p.discordName || p.name || undefined,
    name: p.name || undefined,
  };
}
function clampFields(state) {
  try {
    ['player1', 'player2'].forEach(pk => {
      const p = state?.players?.[pk];
      if (!p) return;
      ensureArrays(p);
      if (Array.isArray(p.field) && p.field.length > MAX_FIELD_SLOTS) {
        const extras = p.field.splice(MAX_FIELD_SLOTS);
        extras.forEach(c => c && (c._cleanupReason = 'overflow'));
        p.discardPile.push(...extras);
        console.warn(`[UI] Field overflow (${pk}) — moved ${extras.length} card(s) to discard for display cap.`);
      }
    });
  } catch {}
}
function normalizeStateForServer(state) {
  clampFields(state);
  return {
    mode: state.mode || 'practice',
    currentPlayer: state.currentPlayer === 'player2' ? 'bot' : state.currentPlayer,
    players: {
      player1: normalizePlayerForServer(state?.players?.player1),
      bot:     normalizePlayerForServer(state?.players?.player2),
    }
  };
}
function mergeServerIntoUI(server) {
  if (!server || typeof server !== 'object') return;

  const localBot = duelState?.players?.player2 ? JSON.parse(JSON.stringify(duelState.players.player2)) : null;
  const locallyPlayed = Array.isArray(duelState._uiPlayedThisTurn) ? [...duelState._uiPlayedThisTurn] : [];

  const next = typeof structuredClone === 'function'
    ? structuredClone(server)
    : JSON.parse(JSON.stringify(server));

  if (next?.players?.bot) {
    next.players.player2 = next.players.bot;
    delete next.players.bot;
  }
  if (next?.currentPlayer === 'bot') next.currentPlayer = 'player2';

  ['player1','player2'].forEach(pk => {
    const P = next?.players?.[pk];
    if (!P) return;

    P.hp = Math.max(0, Math.min(MAX_HP, Number(P.hp ?? MAX_HP)));

    P.hand = Array.isArray(P.hand) ? P.hand.map(e => toEntry(e, pk === 'player2')) : [];
    P.field = Array.isArray(P.field) ? P.field.map(toFieldEntry) : [];
    P.deck = Array.isArray(P.deck) ? P.deck.map(e => toEntry(e, false)) : [];
    P.discardPile = Array.isArray(P.discardPile) ? P.discardPile.map(e => toEntry(e, false)) : [];

    if (pk === 'player2') P.hand = P.hand.map(e => ({ ...e, isFaceDown: true }));

    // Preserve resolved names if server lacks them
    if (!P.discordName && fetchedNames[pk]) P.discordName = fetchedNames[pk];
    if (!P.name && fetchedNames[pk]) P.name = fetchedNames[pk];
  });

  if (localBot && next?.players?.player2) {
    const nextBot = next.players.player2;
    const serverField = Array.isArray(nextBot.field) ? nextBot.field : [];
    const localField  = Array.isArray(localBot.field) ? localBot.field : [];

    if (localField.length > serverField.length) nextBot.field = localField.map(toFieldEntry);

    if (Array.isArray(nextBot.hand) && locallyPlayed.length) {
      const playedSet = new Set(locallyPlayed.map(p => pad3(p.cardId)));
      nextBot.hand = nextBot.hand.filter(h => {
        const cid = pad3(h.cardId ?? h.id ?? h.card_id ?? h);
        return !playedSet.has(cid);
      });
    }
  }

  reapplyFiredTrapFaceState();
  clampFields(next);

  Object.assign(duelState, next);
}

/* ---------------- fetch helpers (bot) ---------------- */
async function postBotTurn(payload) {
  let res = await fetch(`${API_BASE}/bot/turn`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });

  if (res.status === 404 || res.status === 405) {
    res = await fetch(`${API_BASE}/duel/turn`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
  }
  return res;
}
function enforceFacedownUnfiredTraps(ownerKey) {
  const P = duelState.players?.[ownerKey];
  if (!P || !Array.isArray(P.field)) return;
  for (const card of P.field) {
    const cid = card?.cardId ?? card?.id ?? card?.card_id;
    if (!cid) continue;
    if (isTrap(cid) && !card._fired) card.isFaceDown = true;
  }
}

/* --------------------- NEW: server snapshot sync --------------------- */
function apiBase() {
  return (API_OVERRIDE || API_BASE || '').replace(/\/+$/, '');
}
let _syncTimer = null;
let _lastSent = ''; // simple string compare to shrink traffic

async function syncToServer() {
  const base = apiBase();
  if (!base) return;
  if (isSpectator) return; // spectators should not push state
  try {
    const payload = normalizeStateForServer(duelState);
    const s = JSON.stringify(payload);
    if (s === _lastSent) return;
    _lastSent = s;

    const res = await fetch(`${base}/duel/sync`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: s,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[UI] sync failed', res.status, t);
    } else {
      // optional: read back server state if you want strict echo
      // const echoed = await res.json().catch(() => null);
      // if (echoed?.state) mergeServerIntoUI(echoed.state);
    }
  } catch (e) {
    console.warn('[UI] sync error', e);
  }
}
function scheduleSync(delay = 120) {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(syncToServer, delay);
}

/* ---------------- bot turn driver ----------------- */
let botTurnInFlight = false;
const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';
const isPracticeMode =
  (new URLSearchParams(window.location.search).get('mode') || '').toLowerCase() === 'practice';

async function maybeRunBotTurn() {
  if (botTurnInFlight) return;
  if (isSpectator) return;
  if (duelState.winner) return;
  if (!duelState?.started) return;
  if (duelState.currentPlayer !== 'player2') return;

  await ensureAllCardsLoaded();

  cleanupEndOfTurnLocal('player1');
  purgeFiredTraps('player2');
  enforceFacedownUnfiredTraps('player1');
  enforceFacedownUnfiredTraps('player2');

  botTurnInFlight = true;
  const turnStart = Date.now();
  try {
    const payload = normalizeStateForServer(duelState);

    try {
      console.log('[UI→Bot] payload', {
        mode: payload.mode,
        currentPlayer: payload.currentPlayer,
        p1: { hp: payload.players.player1.hp, hand: payload.players.player1.hand.length, field: payload.players.player1.field.length, deck: payload.players.player1.deck.length },
        bot: { hp: payload.players.bot.hp, hand: payload.players.bot.hand.length, field: payload.players.bot.field.length, deck: payload.players.bot.deck.length },
      });
    } catch {}

    let playedPre = false;
    try {
      playedPre = await botAutoPlayAssist();
      if (playedPre) {
        await resolveBotNonTrapCardsOnce();
        enforceFacedownUnfiredTraps('player2');
      }
    } catch (e) { console.warn('[UI] pre-play assist error', e); }

    if (!duelState.winner) {
      const res = await postBotTurn(payload);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[UI] Bot move failed:', res.status, txt);
      } else {
        const updated = await res.json().catch(() => null);
        if (updated) {
          mergeServerIntoUI(updated);
          enforceFacedownUnfiredTraps('player2');
          enforceFacedownUnfiredTraps('player1');
        }
      }
    }

    let playedPost = false;
    if (!duelState.winner && duelState.currentPlayer === 'player2' && !playedPre) {
      playedPost = await botAutoPlayAssist();
      if (playedPost) {
        await resolveBotNonTrapCardsOnce();
        enforceFacedownUnfiredTraps('player2');
      }
    }

    const bot = duelState?.players?.player2;
    if (!duelState.winner && duelState.currentPlayer === 'player2' && bot && !playedPre && !playedPost) {
      ensureArrays(bot);
      if (bot.hand.length && (bot.field?.length ?? 0) < MAX_FIELD_SLOTS) {
        const first = bot.hand[0];
        const cid = (typeof first === 'object' && first !== null) ? (first.cardId ?? first.id ?? first.card_id) : first;
        const faceDown = isTrap(cid);
        console.warn('[UI] fallback: forcing a play', { id: pad3(cid), faceDown });
        bot.hand = bot.hand.slice();
        await (async () => {
          const idx = 0;
          const [card] = bot.hand.splice(idx, 1);
          const cardId = pad3((typeof card === 'object' && card !== null) ? (card.cardId ?? card.id ?? card.card_id) : card);
          const final = { cardId, isFaceDown: faceDown || isTrap(cardId) };
          bot.field.push(final);
          renderZones();
          await wait();
          const meta = getMeta(final.cardId);
          try { await audio.playForCard(meta, 'place', { channel: 'ui' }); } catch {}
          if (!final.isFaceDown) {
            await resolveImmediateEffect(meta, 'player2');
            final._resolvedByUI = true;
            setHpText();
            await wait();
          } else {
            await wait();
          }
          duelState._uiPlayedThisTurn ||= [];
          duelState._uiPlayedThisTurn.push({ cardId: final.cardId, isFaceDown: final.isFaceDown });
          enforceFacedownUnfiredTraps('player2');
        })();
      }
    }

    await wait();
  } catch (err) {
    console.error('[UI] Bot move error:', err);
    if (!duelState.winner && duelState.currentPlayer === 'player2') {
      await botAutoPlayAssist();
      await resolveBotNonTrapCardsOnce();
      enforceFacedownUnfiredTraps('player2');
      await wait();
    }
  } finally {
    const elapsed = Date.now() - turnStart;
    if (elapsed < MIN_TURN_MS) await wait(MIN_TURN_MS - elapsed);

    if (!duelState.winner && duelState.currentPlayer === 'player1') {
      await wait(1500);
      cleanupEndOfTurnLocal('player2');
      purgeFiredTraps('player1');
      duelState._uiPlayedThisTurn = [];
    }

    botTurnInFlight = false;

    startTurnDrawIfNeeded();

    await resolveBotNonTrapCardsOnce();
    enforceFacedownUnfiredTraps('player2');
    enforceFacedownUnfiredTraps('player1');

    setHpText();
    setTurnText();
    renderZones();
    updateDiscardCounters();
  }
}

/* ---------------- start-of-turn auto-draw (human only) ---------------- */
function ensureTurnFlags() {
  duelState._startDrawDoneFor ||= { player1: false, player2: false };
  if (typeof duelState._startDrawDoneFor.player1 !== 'boolean') duelState._startDrawDoneFor.player1 = false;
  if (typeof duelState._startDrawDoneFor.player2 !== 'boolean') duelState._startDrawDoneFor.player2 = false;
}
function startTurnDrawIfNeeded() {
  if (!duelState?.started) return;
  if (duelState.winner) return;

  ensureTurnFlags();

  if (duelState.currentPlayer !== 'player1') return;
  if (duelState._startDrawDoneFor.player1) return;

  const P = duelState.players?.player1;
  if (!P) return;
  ensureArrays(P);

  if (P.buffs?.skipNextDraw) {
    P.buffs.skipNextDraw = false;
  } else {
    drawFor('player1');
  }
  const extra = Number(P.buffs?.extraDrawPerTurn || 0);
  for (let i = 0; i < extra; i++) drawFor('player1');
  if (P.buffs?.blockHealTurns > 0) P.buffs.blockHealTurns--;

  duelState._startDrawDoneFor.player1 = true;
}

/* ----------------- render helpers ----------------- */
function renderZones() {
  renderHand('player1', isSpectator);
  renderHand('player2', isSpectator);
  renderField('player1', isSpectator);
  renderField('player2', isSpectator);

  // NEW: push a tiny snapshot to server so spectators mirror UI
  scheduleSync();
}

/* ---------------- Winner overlay ---------------- */
function showWinnerOverlay() {
  if (document.getElementById('duel-summary-overlay')) return;

  const winnerKey = duelState.winner;
  const loserKey  = winnerKey === 'player1' ? 'player2' : 'player1';

  const overlay = document.createElement('div');
  overlay.id = 'duel-summary-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.78); z-index:10000;
    display:flex; align-items:center; justify-content:center; padding:24px;`;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background:#0f1114; color:#e6e6e6; width:min(900px, 96vw); border-radius:16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.6); padding:22px 22px 16px;`;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:24px; font-weight:800; margin-bottom:6px;';
  title.textContent = `🏆 Winner: ${nameOf(winnerKey)}`;

  const sub = document.createElement('div');
  sub.style.cssText = 'opacity:.8; margin-bottom:14px;';
  sub.textContent = 'Duel Summary';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr; gap:14px;';

  const cardFor = (key, label) => {
    const P = duelState.players[key];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px solid #26303a; border-radius:12px; padding:12px;';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:700; margin-bottom:8px;';
    h.textContent = `${label} — ${nameOf(key)}`;
    const list = document.createElement('div');
    list.innerHTML = `
      <div>HP: <b>${P.hp}</b></div>
      <div>Field: <b>${(P.field||[]).length}</b></div>
      <div>Hand: <b>${(P.hand||[]).length}</b></div>
      <div>Deck: <b>${(P.deck||[]).length}</b></div>
      <div>Discard: <b>${(P.discard||P.discardPile||[]).length}</b></div>
    `;
    wrap.appendChild(h); wrap.appendChild(list);
    return wrap;
  };

  grid.appendChild(cardFor(winnerKey, 'Winner'));
  grid.appendChild(cardFor(loserKey, 'Opponent'));

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; gap:10px; justify-content:flex-end; margin-top:14px;';

  const playAgain = document.createElement('button');
  playAgain.textContent = 'Play Again';
  playAgain.style.cssText = 'padding:10px 14px; border-radius:10px; border:1px solid #2b3946; background:#16202a; color:#e6e6e6; cursor:pointer;';
  playAgain.onclick = () => { window.location.href = withTokenAndApi(`${UI_BASE}/?mode=practice`); };

  const toHub = document.createElement('a');
  toHub.textContent = 'Return to Hub';
  toHub.href = withTokenAndApi(`${HUB_BASE}/`);
  toHub.style.cssText = 'padding:10px 14px; border-radius:10px; border:1px solid #2b3946; background:#0d141a; color:#e6e6e6; text-decoration:none;';

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy Summary JSON';
  copyBtn.style.cssText = 'margin-right:auto; padding:10px 14px; border-radius:10px; border:1px solid #2b3946; background:#1a2530; color:#e6e6e6; cursor:pointer;';
  copyBtn.onclick = () => {
    const payload = buildSummary();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(()=>{});
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = 'Copy Summary JSON', 1200);
  };

  actions.appendChild(copyBtn);
  actions.appendChild(playAgain);
  actions.appendChild(toHub);

  panel.appendChild(title);
  panel.appendChild(sub);
  panel.appendChild(grid);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // push one last sync so spectators lock on winner state
  scheduleSync(10);
}

function buildSummary() {
  const duelId = `duel_${Date.now()}`;
  return {
    duelId,
    winner: duelState.winner,
    hp: {
      player1: duelState.players.player1.hp,
      player2: duelState.players.player2.hp,
    },
    cards: {
      player1: {
        field: duelState.players.player1.field.length,
        hand: duelState.players.player1.hand.length,
        deck: duelState.players.player1.deck.length,
        discard: duelState.players.player1.discardPile.length,
      },
      player2: {
        field: duelState.players.player2.field.length,
        hand: duelState.players.player2.hand.length,
        deck: duelState.players.player2.deck.length,
        discard: duelState.players.player2.discardPile.length,
      },
    },
  };
}

/* ---------------- Spectators bar (spectator view) ---------------- */
function ensureSpectatorsBar() {
  let bar = document.getElementById('spectators-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'spectators-bar';
    bar.style.cssText = `
      position: fixed; right: 12px; bottom: 12px; z-index: 9998;
      background: rgba(15,17,20,.86); color: #d6e2ee;
      border: 1px solid #26303a; border-radius: 10px; padding: 8px 10px;
      font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji';
      max-width: min(40vw, 320px);
    `;
    bar.innerHTML = `<div style="opacity:.8;margin-bottom:6px;font-weight:700;">Spectators</div><div id="spectators-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>`;
    document.body.appendChild(bar);
  }
  return bar;
}

function renderSpectators(list) {
  const bar = ensureSpectatorsBar();
  const box = bar.querySelector('#spectators-list');
  box.innerHTML = '';
  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement('div');
    empty.style.opacity = '.6';
    empty.textContent = 'None';
    box.appendChild(empty);
    return;
  }
  list.forEach(n => {
    const pill = document.createElement('span');
    pill.textContent = String(n);
    pill.style.cssText = `
      display:inline-block; border:1px solid #2b3946; border-radius:999px;
      padding:3px 8px; background:#12202c; color:#d6e2ee;`;
    box.appendChild(pill);
  });
}

let spectatorsTimer = null;
async function pollSpectators() {
  // Only in spectator view with an API and a duel id
  if (!isSpectator || !(API_OVERRIDE || API_BASE) || !DUEL_ID) return;

  const base = API_OVERRIDE || API_BASE;
  const candidates = [
    `${base}/duel/${encodeURIComponent(DUEL_ID)}/spectators`,
    `${base}/spectators?duel=${encodeURIComponent(DUEL_ID)}`
  ];

  let names = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        // accept { spectators: [...] } or plain [...]
        names = Array.isArray(data) ? data : (Array.isArray(data?.spectators) ? data.spectators : null);
        if (names) break;
      }
    } catch { /* try next */ }
  }
  if (!names) names = [];

  renderSpectators(
    names.map(x => (x?.discordName || x?.name || x?.username || x || 'Unknown'))
  );
}

function beginSpectatorsLoop() {
  if (!isSpectator) return;
  ensureSpectatorsBar();
  if (spectatorsTimer) clearInterval(spectatorsTimer);
  spectatorsTimer = setInterval(pollSpectators, 5000);
  pollSpectators().catch(()=>{});
}

/* ------------------ main render ------------------ */
export async function renderDuelUI(root) {
  await ensureAllCardsLoaded();

  // Resolve names from tokens first (non-blocking for rest of UI)
  await initPlayerNames();

  audio.configure({ bgSrc: '/audio/bg/Follow the Trail.mp3', sfxBase: '/audio/sfx/' });
  audio.setDebug(true);
  audio.initAutoplayUnlock();
  installSoundToggleUI();

  detectWinner();

  try {
    if (duelState?.started) document.body.classList.add('duel-ready');
    else document.body.classList.remove('duel-ready');
  } catch {}

  if (duelState?.started && !audio.isBgPlaying()) {
    audio.startBg();
  }

  clampFields(duelState);
  startTurnDrawIfNeeded();
  reapplyFiredTrapFaceState();
  await resolveBotNonTrapCardsOnce();

  // place SFX for human
  playPlaceSfxForNewFieldCards('player1');

  await resolveHumanNonTrapCardsOnce();
  enforceFacedownUnfiredTraps('player1');
  enforceFacedownUnfiredTraps('player2');

  renderZones();
  setHpText();
  setTurnText();
  updateDiscardCounters();

  // Start spectators polling if applicable
  beginSpectatorsLoop();

  if (duelState.winner) {
    try { document.querySelector('[data-start-practice]')?.classList?.add('hidden'); } catch {}
    if (!duelState.summarySaved && !isSpectator) {
      duelState.summarySaved = true;
      const summary = buildSummary();
      fetch(`${API_BASE}/summary/save`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(summary),
      }).catch(err => console.error('[UI] Summary save failed:', err));
    }
    showWinnerOverlay();
    return;
  }

  if (duelState.currentPlayer === 'player2') {
    void maybeRunBotTurn();
  }
}
