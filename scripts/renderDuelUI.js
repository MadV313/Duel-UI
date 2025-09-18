// scripts/renderDuelUI.js
import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import { API_BASE, UI_BASE } from './config.js';
import allCards from './allCards.js';
const pad3 = id => String(id).padStart(3, '0');
const getMeta = id => allCards.find(c => c.card_id === pad3(id));

// --- allCards loader (works everywhere; no import assertions needed)
let allCards = [];
let allCardsReady = false;
let allCardsLoading = null;

async function ensureAllCardsLoaded() {
  if (allCardsReady) return;
  if (allCardsLoading) { await allCardsLoading; return; }
  allCardsLoading = (async () => {
    try {
      // try same folder first
      let res = await fetch('./allCards.json', { cache: 'no-store' });
      if (!res.ok) {
        // fallback to /scripts (your prod path in the console log)
        res = await fetch('/scripts/allCards.json', { cache: 'no-store' });
      }
      allCards = await res.json();
      allCardsReady = true;
      console.log('[UI] allCards loaded:', Array.isArray(allCards) ? allCards.length : 0);
    } catch (e) {
      console.error('[UI] Failed to load allCards.json', e);
      allCards = [];
      allCardsReady = true; // prevent infinite retries; UI will still run but with no metadata
    } finally {
      allCardsLoading = null;
    }
  })();
  await allCardsLoading;
}

const isSpectator = new URLSearchParams(window.location.search).get('spectator') === 'true';
const isPracticeMode =
  (new URLSearchParams(window.location.search).get('mode') || '').toLowerCase() === 'practice';

// Prevent double-sending bot turns if render fires rapidly
let botTurnInFlight = false;

// UI-enforced limits (keeps display sane even if backend misbehaves)
const MAX_FIELD_SLOTS = 3;
const MAX_HP = 200;
const MAX_HAND = 4;

// 🔧 SAFETY: never perform UI-side "discard 1 card" from hand.
// Let the backend or explicit card logic handle actual discards.
const ENABLE_UI_SIDE_HAND_DISCARD = false;

// 🎬 Turn pacing (slow-mo)
// 🔴 slightly slower so flips/effects are readable
const SLOW_MO_MS = 1000;          // was 750ms
const MIN_TURN_MS = 7500;         // was 6000ms
const wait = (ms = SLOW_MO_MS) => new Promise(r => setTimeout(r, ms));

/* ------------------ small helpers ------------------ */
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

// Traps are #106–#120 in your master list.
// Use this as a fallback when meta is missing/out-of-sync.
function isTrapIdByRange(cardId) {
  const n = asInt(cardId);
  return n >= 106 && n <= 120;
}

function isTrap(cardId) {
  const m = getMeta(cardId);
  const t = String(m?.type || '').toLowerCase();
  const name = String(m?.name || '').toLowerCase();

  // Primary signals
  if (t === 'trap') return true;
  if (hasTag(m, 'trap')) return true;
  if (/\btrap\b/.test(name)) return true;

  // Fallback: id range (106–120) — covers cases where meta isn't loaded/merged yet
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

// 🔴 central winner detector (UI-side, esp. practice mode)
function detectWinner() {
  try {
    if (duelState.winner) return duelState.winner;
    const p1 = Number(duelState?.players?.player1?.hp ?? MAX_HP);
    const p2 = Number(duelState?.players?.player2?.hp ?? MAX_HP);

    if (p1 <= 0 && p2 <= 0) {
      // edge-case draw: prefer defender lost last? (no context), just mark player1 for now
      duelState.winner = 'player1';
    } else if (p1 <= 0) {
      duelState.winner = 'player2';
    } else if (p2 <= 0) {
      duelState.winner = 'player1';
    }
    if (duelState.winner) {
      // keep the board visible and stop any future bot moves
      duelState.started = true;
      console.log('[win] detected:', duelState.winner);
    }
    return duelState.winner || null;
  } catch {
    return null;
  }
}

function changeHP(playerKey, delta) {
  const p = duelState?.players?.[playerKey];
  if (!p) return;
  const next = Math.max(0, Math.min(MAX_HP, Number(p.hp ?? MAX_HP) + Number(delta)));
  p.hp = next;
  // 🔴 check victory on every HP change
  detectWinner();
}

function drawFor(playerKey) {
  const P = duelState?.players?.[playerKey];
  if (!P) return false;
  ensureArrays(P);
  if (P.hand.length >= MAX_HAND) return false;
  if (P.deck.length === 0) return false;
  const top = P.deck.shift();
  const entry = toEntry(top, playerKey === 'player2'); // bot hand is face-down visually
  P.hand.push(entry);
  return true;
}

/* ------------ lightweight picker overlay for human choices ------------ */
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

/* -------------- Walkie Talkie: human swap (discard <-> hand) -------------- */
async function runWalkieSwapFor(ownerKey, walkieFieldCard) {
  const P = duelState.players?.[ownerKey];
  if (!P) return;
  ensureArrays(P);

  if (!Array.isArray(P.discardPile) || P.discardPile.length === 0) return;
  if (!Array.isArray(P.hand) || P.hand.length === 0) return;

  // pick from discard
  const pickDiscard = await presentCardPicker(P.discardPile, { title: 'Pick a card FROM YOUR DISCARD' });
  if (!pickDiscard) return;
  const discardIdx = pickDiscard.index;

  // pick from hand
  const pickHand = await presentCardPicker(P.hand, { title: 'Pick a card FROM YOUR HAND to swap' });
  if (!pickHand) return;
  const handIdx = pickHand.index;

  // perform swap (keep objects)
  const fromDiscard = P.discardPile.splice(discardIdx, 1)[0];
  const fromHand    = P.hand.splice(handIdx, 1, fromDiscard)[0]; // put discard card into hand
  P.discardPile.push(fromHand); // put the original hand card into discard

  // After use, Walkie Talkie is consumable → move the field card to discard
  if (walkieFieldCard) {
    moveFieldCardToDiscard(ownerKey, walkieFieldCard);
  }

  // refresh UI
  renderZones();
  updateDiscardCounters();
}

/* ------ category draw (needed for bot “draw 1 loot/defense…” cards) ------ */
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
    P.discardPile.push(c);
  }
}

function discardRandomTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureArrays(P);
  const i = P.field.findIndex(c => c && isTrap(c.cardId));
  if (i !== -1) {
    const [c] = P.field.splice(i, 1);
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
    P.discardPile.push(c);
    return true;
  }
  return false;
}

/* ---------- fired trap face-state persistence (LAZY; no top-level mutation) ---------- */
function firedTrapMarks() {
  // Create on first access so we never touch duelState during module initialize
  duelState._pendingFiredTraps ||= [];
  return duelState._pendingFiredTraps;
}

/** Ensure any locally-fired traps stay face-up even after a server merge. */
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

/* --------- utility: parse 10x2 style damage or normal “deal X DMG/DAMAGE” --------- */
function damageFromText(effectText) {
  const s = String(effectText || '').toLowerCase();
  const mult = s.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (mult) return Number(mult[1]) * Number(mult[2]);
  const m = s.match(/deal[s]?\s+(\d+)\s*(?:dmg|damage)\b/);
  return m ? Number(m[1]) : 0;
}

/* ---------- persistence helper (mirror duel.js) ---------- */
function isPersistentOnField(meta) {
  // Unknown meta should NOT stick around—treat as ephemeral so the board clears.
  if (!meta) return false;
  const t = String(meta.type || '').toLowerCase();
  if (t === 'defense') return true;
  if (t === 'trap') return true; // traps stay set until they fire
  const tags = new Set(tagsOf(meta));
  return tags.has('persistent') || tags.has('equip') || tags.has('gear') || tags.has('armor');
}

/** Remove only fired traps for a given owner (move to discard). */
function purgeFiredTraps(ownerKey) {
  const P = duelState.players?.[ownerKey];
  if (!P) return;
  ensureArrays(P);
  if (!Array.isArray(P.field) || P.field.length === 0) return;

  const keep = [];
  const moved = [];

  for (const card of P.field) {
    // be robust to different shapes
    const rawId = card?.cardId ?? card?.id ?? card?.card_id;
    const cardId = rawId != null ? pad3(rawId) : null;
    const firedTrap = !!(card && cardId && isTrap(cardId) && card._fired);

    if (firedTrap) {
      // push a clean copy into discard (face-up, not "fired" anymore)
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

    // drop any persisted face-state marks for these traps
    try {
      const toRemove = new Set(moved.map(c => c.cardId));
      const marks = firedTrapMarks();
      duelState._pendingFiredTraps = marks.filter(
        m => !(m.owner === ownerKey && toRemove.has(pad3(m.cardId)))
      );
    } catch {}

    try {
      console.log('[purgeFiredTraps]', { owner: ownerKey, moved: moved.map(c => c.cardId) });
    } catch {}
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
      // fired traps (_fired) leave at end of turn; unfired traps stay set
      if (card._fired) { card._cleanupReason = 'firedTrap'; toss.push(card); }
      else keep.push(card);
    } else if (isPersistentOnField(meta)) {
      keep.push(card);
    } else {
      card._cleanupReason = 'notPersistent';
      toss.push(card);
    }
  }
  // Clear any pending fired markers for this owner if those traps were removed now
  try {
    const marks = firedTrapMarks();
    duelState._pendingFiredTraps = marks.filter(m => {
      // keep marks that are not owned by this player OR still exist on field
      if (m.owner !== playerKey) return true;
      return (P.field || []).some(c => c && isTrap(c.cardId) && c.cardId === m.cardId && c._fired);
    });
  } catch {}

  if (toss.length) {
    P.discardPile.push(...toss);
    try {
      toss.forEach(c => console.log('[cleanup] moved to discard', { owner: playerKey, id: c.cardId, reason: c._cleanupReason || 'unknown' }));
    } catch {}
  }
  P.field = keep;
}

/* ---------- Trap activation (UI side, for bot & human plays) ---------- */
function triggerOneTrap(defenderKey) {
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
  resolveImmediateEffect(meta, defenderKey);

  try { console.log('[trap] fired', { owner: defenderKey, id: trap.cardId }); } catch {}
  return true;
}

/* -------------- UI-side effect resolver (bot & human) -------------- */
function resolveImmediateEffect(meta, ownerKey) {
  const you = ownerKey;
  const foe = ownerKey === 'player1' ? 'player2' : 'player1';

  // Fire one defender trap BEFORE any Attack/Infected resolves (works for bot & human)
  const type  = String(meta?.type || '').toLowerCase();
  const name  = String(meta?.name || '').toLowerCase();
  const tags  = new Set(tagsOf(meta || {}));
  const isAtkOrInf =
    type === 'attack' ||
    type === 'infected' ||
    tags.has('infected') ||
    /\binfected\b/.test(name);

  if (isAtkOrInf) {
    triggerOneTrap(foe); // flips, marks _fired, resolves trap for defender
  }

  if (!meta) return;

  const text = `${String(meta.effect || '')} ${String(meta.logic_action || '')}`.toLowerCase();

  // --- damage ("10x2", "deal X dmg/damage")
  const dmg = damageFromText(text);
  if (dmg > 0) changeHP(foe, -dmg);

  // --- heal
  const mHeal = text.match(/(?:restore|heal)\s+(\d+)\s*hp?/);
  if (mHeal) changeHP(you, +Number(mHeal[1]));

  // --- draws
  const mDraw = text.match(/draw\s+(a|\d+)\s+(?:card|cards)/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
  }

  // --- category draws
  if (/draw\s+1\s+loot\s+card/.test(text))     drawFromDeckWhere(you, isType('loot'));
  if (/draw\s+1\s+defense\s+card/.test(text))  drawFromDeckWhere(you, isType('defense'));
  if (/draw\s+1\s+tactical\s+card/.test(text)) drawFromDeckWhere(you, isType('tactical'));
  if (/draw\s+1\s+attack\s+card/.test(text))   drawFromDeckWhere(you, isType('attack'));
  if (/draw\s+1\s+trap\s+card/.test(text))     drawFromDeckWhere(you, (m) => isType('trap')(m) || hasTag(m, 'trap'));

  // --- (UI-side discard is intentionally disabled unless you flip ENABLE_UI_SIDE_HAND_DISCARD)

  // --- skip next draw
  if (/skip\s+next\s+draw/.test(text)) {
    duelState.players[you].skipNextDraw = true;
  }

  // --- destroy/remove enemy field card
  if (/(?:destroy|remove)\s+(?:1\s+)?enemy(?:\s+field)?\s+card/.test(text)) {
    const foeField = duelState.players[foe].field || [];
    if (foeField.length) {
      const idx = /random/.test(text) ? Math.floor(Math.random() * foeField.length) : 0;
      const [destroyed] = foeField.splice(idx, 1);
      duelState.players[foe].discardPile ||= [];
      duelState.players[foe].discardPile.push(destroyed);
    }
  }

  // --- infected targets
  if (/(?:destroy|kill|remove)\s+(?:1\s+)?infected/.test(text)) {
    destroyEnemyInfected(foe);
  }

  // --- traps
  if (/(?:disarm|disable|destroy)\s+(?:an?\s+)?trap/.test(text)) {
    discardRandomTrap(foe);
  }
  if (/(?:reveal|expose)\s+(?:an?\s+)?trap/.test(text)) {
    revealRandomEnemyTrap(foe);
  }

  // 🔴 after any effects, do one more victory check (belt & suspenders)
  detectWinner();
}

/** Scan bot field for newly-placed non-traps and resolve them once (no auto-discard here). */
function resolveBotNonTrapCardsOnce() {
  const bot = duelState?.players?.player2;
  if (!bot || !Array.isArray(bot.field)) return;
  for (const card of bot.field.slice()) {
    if (duelState.winner) break; // 🔴 stop resolving if duel already ended
    // Only resolve if face-up, non-trap, and not already resolved by the UI
    if (card && !card.isFaceDown && !isTrap(card.cardId) && !card._resolvedByUI) {
      const meta = getMeta(card.cardId);
      resolveImmediateEffect(meta, 'player2');
      card._resolvedByUI = true;
    }
  }
}

/** Scan human field for newly-placed non-traps and resolve them once. */
async function resolveHumanNonTrapCardsOnce() {
  const human = duelState?.players?.player1;
  if (!human || !Array.isArray(human.field)) return;
  for (const card of human.field.slice()) {
    if (duelState.winner) break; // 🔴 stop if duel already ended
    if (card && !card.isFaceDown && !isTrap(card.cardId) && !card._resolvedByUI) {
      const meta = getMeta(card.cardId);
      const n = String(meta?.name || '').toLowerCase();
      const text = `${String(meta?.effect || '')} ${String(meta?.logic_action || '')}`.toLowerCase();
      if (n.includes('walkie') || /swap\s+one\s+card/.test(text)) {
        await runWalkieSwapFor('player1', card);
        card._resolvedByUI = true;
        continue;
      }
      resolveImmediateEffect(meta, 'player1');
      card._resolvedByUI = true;

      if (shouldAutoDiscard(meta)) {
        moveFieldCardToDiscard('player1', card);
      }
    }
  }
}

/* ---------------- Bot auto-play assist (client-side safety net) ---------------- */
async function botAutoPlayAssist() {
  const bot = duelState?.players?.player2;
  if (!bot) return false;
  ensureArrays(bot);

  const fieldHasRoom = () => Array.isArray(bot.field) && bot.field.length < MAX_FIELD_SLOTS;

  const playOne = async (entry, faceDownHint) => {
    if (duelState.winner) return false; // 🔴 never play after win
    const idx = bot.hand.findIndex(h => (h.cardId ?? h) === (entry.cardId ?? entry));
    if (idx === -1 || !fieldHasRoom()) return false;
    const [card] = bot.hand.splice(idx, 1);
    const cid = (typeof card === 'object' && card !== null) ? (card.cardId ?? card.id ?? card.card_id) : card;
    const final = { cardId: pad3(cid), isFaceDown: !!faceDownHint };
    if (isTrap(final.cardId)) final.isFaceDown = true;
    bot.field.push(final);
    console.log('[bot] place', { id: final.cardId, faceDown: final.isFaceDown });
    renderZones();
    await wait();

    duelState._uiPlayedThisTurn ||= [];
    duelState._uiPlayedThisTurn.push({ cardId: final.cardId, isFaceDown: final.isFaceDown });

    const meta = getMeta(final.cardId);
    if (!final.isFaceDown) {
      resolveImmediateEffect(meta, 'player2');
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
  return p.discordName || p.name || (playerKey === 'player2' ? 'Practice Bot' : 'Player 1');
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
    el.textContent = `Winner: ${duelState.winner} (${nameOf(duelState.winner)})`;
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

/* --------- discard counter helpers (UI only) --------- */
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
  });

  if (isPracticeMode && localBot && next?.players?.player2) {
    const nextBot = next.players.player2;
    const serverField = Array.isArray(nextBot.field) ? nextBot.field : [];
    const localField  = Array.isArray(localBot.field) ? localBot.field : [];
    if (localField.length > serverField.length) {
      nextBot.field = localField.map(toFieldEntry);
    }
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

/* --------------- UI safety clamps (display only) --------------- */
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
}

/* ---------------- fetch helpers (bot) ---------------- */
async function postBotTurn(payload) {
  let res = await fetch(`${API_BASE}/bot/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 404 || res.status === 405) {
    res = await fetch(`${API_BASE}/duel/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (isTrap(cid) && !card._fired) {
      card.isFaceDown = true;
    }
  }
}

/* ---------------- bot turn driver ----------------- */
async function maybeRunBotTurn() {
  if (botTurnInFlight) return;
  if (isSpectator) return;
  if (duelState.winner) return;                 // 🔴 do nothing after win
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
    if (duelState.winner) return;               // 🔴 bail if win appeared during cleanup

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
        resolveBotNonTrapCardsOnce();
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
        resolveBotNonTrapCardsOnce();
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
          if (!final.isFaceDown) {
            resolveImmediateEffect(meta, 'player2');
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
      resolveBotNonTrapCardsOnce();
      enforceFacedownUnfiredTraps('player2');
      await wait();
    }
  } finally {
    const elapsed = Date.now() - turnStart;
    if (elapsed < MIN_TURN_MS) {
      await wait(MIN_TURN_MS - elapsed);
    }

    if (!duelState.winner && duelState.currentPlayer === 'player1') {
      await wait(1500);
      cleanupEndOfTurnLocal('player2');
      purgeFiredTraps('player1');
      duelState._uiPlayedThisTurn = [];
    }

    botTurnInFlight = false;

    startTurnDrawIfNeeded();
    resolveBotNonTrapCardsOnce();
    enforceFacedownUnfiredTraps('player2');
    enforceFacedownUnfiredTraps('player1');

    setHpText();
    setTurnText();
    renderZones();
    updateDiscardCounters();
  }
}

/* ------------------ main render ------------------ */
export async function renderDuelUI() {
  await ensureAllCardsLoaded();

  // 🔴 make sure winner is detected ASAP (e.g., after a merge)
  detectWinner();

  try {
    if (duelState?.started) {
      document.body.classList.add('duel-ready');
    } else {
      document.body.classList.remove('duel-ready');
    }
  } catch {}

  clampFields(duelState);

  startTurnDrawIfNeeded();
  reapplyFiredTrapFaceState();

  resolveBotNonTrapCardsOnce();
  await resolveHumanNonTrapCardsOnce();

  enforceFacedownUnfiredTraps('player1');
  enforceFacedownUnfiredTraps('player2');

  renderZones();
  setHpText();
  setTurnText();
  updateDiscardCounters();

  // If duel is over, save summary (non-spectator) and redirect
  if (duelState.winner) {
    if (!duelState.summarySaved && !isSpectator) {
      const duelId = `duel_${Date.now()}`;
      const summary = {
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

      duelState.summarySaved = true;

      fetch(`${API_BASE}/summary/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      })
        .catch(err => console.error('[UI] Summary save failed:', err))
        .finally(() => {
          window.location.href = `${UI_BASE}/summary.html?duelId=${duelId}`;
        });
    }
    return;
  }

  // Kick the bot if it's their turn
  if (duelState.currentPlayer === 'player2') {
    void maybeRunBotTurn();
  }
}
