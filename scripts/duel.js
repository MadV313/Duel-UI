// scripts/duel.js — draw, play, discard, turn logic (UI-only)
import { duelState } from './duelState.js';
import { renderDuelUI as _renderDuelUI } from './renderDuelUI.js';
import { applyStartTurnBuffs } from './buffTracker.js';
import { triggerAnimation } from './animations.js';
import allCards from './allCards.js';
import { audio } from './audio.js';

// --- Config (UI guards)
const MAX_FIELD_SLOTS = 3;
const MAX_HAND        = 4;
const MAX_HP          = 200;

/* ---------------- helpers ---------------- */

function pad3(id) { return String(id).padStart(3, '0'); }
function getMeta(id) { return allCards.find(c => c.card_id === pad3(id)); }
function txt(s) { return String(s || '').toLowerCase(); }
function tagset(meta) {
  const raw = Array.isArray(meta?.tags)
    ? meta.tags
    : String(meta?.tags || '').split(',').map(s => s.trim()).filter(Boolean);
  return new Set(raw.map(t => t.toLowerCase()));
}
function hasTag(meta, t) { return tagset(meta).has(String(t).toLowerCase()); }
function isTrapMeta(meta) {
  const t = txt(meta?.type);
  return t === 'trap' || hasTag(meta, 'trap');
}

// Persistent vs ephemeral on field
function isPersistentOnField(meta) {
  if (!meta) return false;
  const t = txt(meta.type);
  if (t === 'defense') return true;           // gear/armor stays
  if (t === 'trap') return true;              // traps stay set (until fired)
  const tags = tagset(meta);                  // allow opt-in persistence
  if (tags.has('persistent') || tags.has('equip') || tags.has('gear') || tags.has('armor')) return true;
  return false;                               // Attack/Loot/Tactical/Infected default to ephemeral
}

// Debounce control buttons during async / heavy ops
function setControlsDisabled(disabled) {
  const buttons = [
    document.getElementById('startPracticeBtn'),
    ...document.querySelectorAll('#controls button')
  ].filter(Boolean);
  buttons.forEach(b => (b.disabled = !!disabled));
}

/* ---------- normalization helpers ---------- */
function toEntry(objOrId, faceDownDefault = false) {
  if (typeof objOrId === 'object' && objOrId !== null) {
    const cid = objOrId.cardId ?? objOrId.id ?? objOrId.card_id ?? '000';
    return { cardId: pad3(cid), isFaceDown: Boolean(objOrId.isFaceDown ?? faceDownDefault) };
  }
  return { cardId: pad3(objOrId), isFaceDown: faceDownDefault };
}

function ensureZones(p) {
  p.hand        ||= [];
  p.field       ||= [];
  p.deck        ||= [];
  p.discardPile ||= [];
  p.buffs       ||= {}; // generic bag: { extraDrawPerTurn, blockHealTurns, skipNextTurn, skipNextDraw, nextAttackBonus, nextAttackMult, ... }
}

/* ---------- SFX guards to avoid duplicate hit sounds ---------- */
let _lastDamageSfxAt = 0;
function _playGenericHitOnce() {
  const now = Date.now();
  if (duelState._suppressGenericHit) return; // card-specific SFX active
  if (now - _lastDamageSfxAt < 250) return;  // throttle bursty sequences
  _lastDamageSfxAt = now;
  try { audio.play('attack_hit.mp3'); } catch {}
}

/** HP adjust with clamping (0–MAX_HP), obeying block-heal */
function changeHP(playerKey, delta) {
  const p = duelState.players[playerKey];
  if (!p) return;
  ensureZones(p);

  if (delta > 0 && p.buffs?.blockHealTurns > 0) {
    console.log(`[heal-block] Healing prevented on ${playerKey} (${delta} HP).`);
    return;
  }

  // 🔊 generic hit SFX, but guarded
  if (delta < 0) _playGenericHitOnce();

  const next = Math.max(0, Math.min(MAX_HP, Number(p.hp ?? 0) + Number(delta)));
  p.hp = next;
}

/* ---------- deck helpers (category draws) ---------- */

function drawRaw(playerKey) {
  const player = duelState?.players?.[playerKey];
  if (!player) return null;
  ensureZones(player);

  if (player.hand.length >= MAX_HAND) return null;
  if (player.deck.length === 0) return null;

  const raw = player.deck.shift();
  const entry = toEntry(raw, playerKey === 'player2'); // bot hand = face-down to user
  player.hand.push(entry);
  return entry;
}

/** Draw 1 card for specific player. Returns true if drawn. */
function drawFor(playerKey) {
  const player = duelState?.players?.[playerKey];
  if (!player) return false;
  ensureZones(player);

  // Handle "skip next draw"
  if (player.buffs?.skipNextDraw) {
    console.log(`[draw] ${playerKey} draw skipped.`);
    player.buffs.skipNextDraw = false;
    return false;
  }
  const got = drawRaw(playerKey);
  if (got) console.log(`[draw] ${playerKey} drew ${got.cardId}`);
  return !!got;
}

/** Draw 1 card from deck that matches predicate(meta). Falls back to normal draw if not found. */
function drawFromDeckWhere(playerKey, predicate) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  if (P.hand.length >= MAX_HAND) return false;

  const idx = P.deck.findIndex(e => {
    const meta = getMeta(typeof e === 'object' ? e.cardId : e);
    return predicate(meta);
  });

  if (idx >= 0) {
    const [chosen] = P.deck.splice(idx, 1);
    const entry = toEntry(chosen, playerKey === 'player2');
    P.hand.push(entry);
    console.log(`[draw+] ${playerKey} drew specific ${entry.cardId}`);
    return true;
  }
  return drawFor(playerKey);
}

const isType = t => meta => txt(meta?.type) === t;
const has = t => meta => hasTag(meta, t);

/* ---------- discard helpers ---------- */

function moveFieldCardToDiscard(playerKey, cardObj) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const idx = P.field.indexOf(cardObj);
  if (idx !== -1) {
    const [c] = P.field.splice(idx, 1);
    P.discardPile.push(c);
  }
}

/* ---------- attack buffs ---------- */

function consumeAttackBuff(playerKey, meta, baseDmg) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const b = P.buffs || {};

  let dmg = baseDmg;

  // Restrict multipliers/bonuses by tags if provided
  const isGun = hasTag(meta, 'gun') || txt(meta.type) === 'attack';
  const allowed = b.attackRestrictTags; // Set([...]) when present
  const metaTags = tagset(meta);

  const tagOK = !allowed || [...allowed].some(t => metaTags.has(t));

  if (b.nextAttackBonus && (!allowed || tagOK)) {
    dmg += b.nextAttackBonus;
  }
  if (b.nextAttackMult && (!allowed || tagOK)) {
    dmg = Math.round(dmg * b.nextAttackMult);
  }

  // Consume once
  P.buffs.nextAttackBonus = 0;
  P.buffs.nextAttackMult  = 0;
  P.buffs.attackRestrictTags = null;

  // Generic “gun buff” from Box of Ammo
  if (isGun && b.gunFlatBonus) {
    dmg += b.gunFlatBonus;
    // one-shot bonus
    P.buffs.gunFlatBonus = 0;
  }

  return dmg;
}

/* ---------- textual effect resolver (UI side) ---------- */

function parseNumberPairTimes(s) {
  // "10x2" or "10 x 2" → 20
  const m = s.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) return Number(m[1]) * Number(m[2]);
  return null;
}

function damageFoe(foe, you, meta, base) {
  const amount = consumeAttackBuff(you, meta, base);
  changeHP(foe, -amount);
  console.log(`⚔️ ${meta.name}: dealt ${amount} DMG to ${foe}`);
  triggerAnimation('bullet');
}

function discardRandomFromHand(playerKey, filterFn = null) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const pool = P.hand
    .map((e, i) => ({ e, i, m: getMeta(typeof e === 'object' ? e.cardId : e) }))
    .filter(obj => (filterFn ? filterFn(obj.m) : true));
  if (!pool.length) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const [card] = P.hand.splice(pick.i, 1);
  P.discardPile.push(card);
  return true;
}

function stealOneFromHand(srcKey, dstKey, filterFn) {
  const src = duelState.players[srcKey];
  const dst = duelState.players[dstKey];
  ensureZones(src); ensureZones(dst);

  const pool = src.hand
    .map((e, i) => ({ e, i, m: getMeta(typeof e === 'object' ? e.cardId : e) }))
    .filter(obj => filterFn(obj.m));

  if (!pool.length || dst.hand.length >= MAX_HAND) return false;

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const [card] = src.hand.splice(pick.i, 1);
  // Normalize visibility
  const entry = toEntry(card, dstKey === 'player2');
  dst.hand.push(entry);
  console.log(`🕵️ Stole ${getMeta(entry.cardId)?.name || entry.cardId} from ${srcKey} → ${dstKey}`);
  return true;
}

function moveOneFromDiscardToDeckTop(playerKey, filterFn) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const pool = P.discardPile
    .map((e, i) => ({ e, i, m: getMeta(typeof e === 'object' ? e.cardId : e) }))
    .filter(obj => filterFn(obj.m));
  if (!pool.length) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const [card] = P.discardPile.splice(pick.i, 1);
  P.deck.unshift(card);
  console.log(`[recycle] returned ${getMeta(card.cardId)?.name || card.cardId} to top of deck`);
  return true;
}

function drawFromDiscard(playerKey, filterFn) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  if (P.hand.length >= MAX_HAND) return false;

  const pool = P.discardPile
    .map((e, i) => ({ e, i, m: getMeta(typeof e === 'object' ? e.cardId : e) }))
    .filter(obj => filterFn(obj.m));
  if (!pool.length) return false;

  const pick = pool[Math.floor(Math.random() * pool.length)];
  const [card] = P.discardPile.splice(pick.i, 1);
  P.hand.push(toEntry(card, playerKey === 'player2'));
  console.log(`[loot-recover] drew ${getMeta(card.cardId)?.name || card.cardId} from discard`);
  return true;
}

// Field utilities used by several effects
function discardRandomTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const trapIdxs = P.field
    .map((e, i) => ({ e, i, m: getMeta(typeof e === 'object' ? e.cardId : e) } ))
    .filter(o => isTrapMeta(o.m));
  if (!trapIdxs.length) return false;
  const pick = trapIdxs[Math.floor(Math.random() * trapIdxs.length)];
  const [c] = P.field.splice(pick.i, 1);
  P.discardPile.push(c);
  triggerAnimation('explosion');
  return true;
}

function revealRandomEnemyTrap(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const traps = P.field.filter(c => c && isTrapMeta(getMeta(c.cardId)) && c.isFaceDown);
  if (!traps.length) return false;
  const chosen = traps[Math.floor(Math.random() * traps.length)];
  chosen.isFaceDown = false;
  return true;
}

function destroyEnemyInfected(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  const idx = P.field.findIndex(e => txt(getMeta(e.cardId)?.type) === 'infected' || /infected/i.test(getMeta(e.cardId)?.name || ''));
  if (idx < 0) return false;
  const [c] = P.field.splice(idx, 1);
  P.discardPile.push(c);
  triggerAnimation('explosion');
  return true;
}

/* ---------- TRAP SYSTEM ---------- */
/** Flip → render → resolve the first facedown trap on defender. It remains on field until End Turn. */
function triggerOneTrap(defenderKey) {
  console.log('[trap] attempting to fire for defender:', defenderKey);
  const D = duelState.players[defenderKey];
  if (!D) return false;
  ensureZones(D);

  const idx = D.field.findIndex(c => c && c.isFaceDown && isTrapMeta(getMeta(c.cardId)));
  if (idx < 0) return false;

  const trap = D.field[idx];
  trap.isFaceDown = false;   // reveal now (visual)
  trap._fired = true;        // mark for End Turn cleanup

  const meta = getMeta(trap.cardId);
  console.log('[trap] flipped', { defender: defenderKey, cardId: trap.cardId, name: meta?.name });

  // 🔊 ensure the trap “fire” SFX cuts through (trap channel, overlap)
  try {
    if (typeof audio.playTrapSfx === 'function') {
      audio.playTrapSfx(meta);
    } else {
      audio.playForCard(meta, 'fire', { channel: 'trap', policy: 'overlap' });
    }
  } catch {}

  // Force a frame so the player sees the flip BEFORE the effect resolves.
  try { _renderDuelUI(); } catch {}

  requestAnimationFrame(() => {
    console.log('[trap] resolving', { defender: defenderKey, cardId: trap.cardId, name: meta?.name });
    resolveImmediateEffect(meta, defenderKey);
    trap._resolvedByUI = true; // avoid double resolves
    triggerAnimation('trap');
  });

  return true;
}

function trapAutoTriggersNow(meta) {
  // We intentionally DO NOT auto-trigger traps on play anymore.
  // Leaving the function in case some future card text needs it again.
  return false;
}

/**
 * Resolve immediate effects for any non-trap card.
 * (Trap retaliation is handled by the caller after this resolves.)
 */
function resolveImmediateEffect(meta, ownerKey) {
  if (!meta) return;

  const you = ownerKey;
  const foe = ownerKey === 'player1' ? 'player2' : 'player1';
  ensureZones(duelState.players[you]);
  ensureZones(duelState.players[foe]);

  const type = txt(meta.type); // keep for infected-specific logic later
  const etext = `${txt(meta.effect)} ${txt(meta.logic_action)}`;

  // ---------- DAMAGE ----------
  const pair = parseNumberPairTimes(etext);
  if (pair) {
    damageFoe(foe, you, meta, pair);
  } else {
    const mD = etext.match(/deal[s]?\s+(\d+)\s*dmg/);
    if (mD) damageFoe(foe, you, meta, Number(mD[1]));
  }

  // to both players (aoe)
  if (/to\s+both\s+players/.test(etext)) {
    const mBoth = etext.match(/deal[s]?\s+(\d+)\s*dmg/);
    const dmg = mBoth ? Number(mBoth[1]) : 0;
    if (dmg > 0) {
      changeHP(you, -dmg);
      changeHP(foe, -dmg);
      triggerAnimation('explosion');
    }
  }

  // over N turns (basic dot → immediate approximation)
  const dot = etext.match(/(\d+)\s*dmg\s+over\s+(\d+)\s*turn/);
  if (dot) {
    const per = Number(dot[1]);
    const turns = Number(dot[2]);
    changeHP(foe, -per);
    duelState.players[foe].buffs.dot = { amount: per, turns };
  }

  // ---------- HEAL ----------
  const mHeal = etext.match(/(restore|heal)\s+(\d+)\s*hp/);
  if (mHeal) {
    changeHP(you, Number(mHeal[2]));
    triggerAnimation('heal');
  }

  // ---------- DRAWS ----------
  const mDraw = etext.match(/draw\s+(a|\d+)\s+card/);
  if (mDraw) {
    const n = mDraw[1] === 'a' ? 1 : Number(mDraw[1]);
    for (let i = 0; i < n; i++) drawFor(you);
  }

  // category draws
  if (/draw\s+1\s+trap\s+card/.test(etext)) {
    drawFromDeckWhere(you, m => isType('trap')(m) || has('trap')(m));
  }
  if (/draw\s+1\s+defense\s+card/.test(etext))    drawFromDeckWhere(you, isType('defense'));
  if (/draw\s+1\s+tactical\s+card/.test(etext))   drawFromDeckWhere(you, isType('tactical'));
  if (/draw\s+1\s+loot\s+card/.test(etext))       drawFromDeckWhere(you, isType('loot'));
  if (/draw\s+1\s+attack\s+card/.test(etext))     drawFromDeckWhere(you, isType('attack'));
  if (/draw\s+1\s+random\s+loot\s+card/.test(etext)) drawFromDeckWhere(you, isType('loot'));
  if (hasTag(meta, 'defense_draw')) drawFromDeckWhere(you, isType('defense'));

  // ---------- DISCARD / STEAL ----------
  if (/discard\s+1\s+card(?!\s+after)/.test(etext)) {
    discardRandomFromHand(you);
  }
  if (/force\s+opponent\s+to\s+discard\s+1\s+attack\s+card/.test(etext)) {
    discardRandomFromHand(foe, m => txt(m.type) === 'attack');
  }
  if (/steal\s+1\s+loot\s+card/.test(etext)) {
    stealOneFromHand(foe, you, m => txt(m.type) === 'loot');
  }

  // ---------- SKIPS ----------
  if (/skip\s+next\s+draw/.test(etext)) {
    duelState.players[you].buffs.skipNextDraw = true;
  }
  if (/skip\s+your\s+next\s+turn|you\s+skip\s+your\s+next\s+turn/.test(etext)) {
    duelState.players[you].buffs.skipNextTurn = true;
  }
  if (/skip\s+their\s+next\s+turn|opponent\s+skips\s+next\s+turn/.test(etext)) {
    duelState.players[foe].buffs.skipNextTurn = true;
  }

  // ---------- HEAL BLOCK ----------
  const blockHeal = etext.match(/block\s+healing\s+for\s+(\d+)\s*turn/);
  if (blockHeal) duelState.players[foe].buffs.blockHealTurns = Number(blockHeal[1]);

  // ---------- DEFENSE / FIELD INTERACTIONS ----------
  if (/destroy\s+1\s+enemy\s+card|destroy\s+1\s+enemy\s+field\s+card|remove\s+1\s+enemy\s+field\s+card/.test(etext)) {
    const foeField = duelState.players[foe].field || [];
    if (foeField.length) {
      const i = /random/.test(etext) ? Math.floor(Math.random() * foeField.length) : 0;
      const [destroyed] = foeField.splice(i, 1);
      duelState.players[foe].discardPile.push(destroyed);
      triggerAnimation('explosion');
    }
  }
  if (/(?:destroy|kill|remove)\s+(?:1\s+)?infected/.test(etext)) {
    destroyEnemyInfected(foe);
  }
  if (/(?:disarm|disable|destroy)\s+(?:an?\s+)?trap/.test(etext)) {
    discardRandomTrap(foe);
  }
  if (/(?:reveal|expose)\s+(?:an?\s+)?trap/.test(etext)) {
    revealRandomEnemyTrap(foe);
  }
  if (/steal[s]?\s+1\s+defense\s+card/.test(etext)) {
    // steal from foe hand first, otherwise from field
    if (!stealOneFromHand(foe, you, m => txt(m.type) === 'defense')) {
      const f = duelState.players[foe].field || [];
      const idx = f.findIndex(e => txt(getMeta(e.cardId)?.type) === 'defense');
      if (idx >= 0 && duelState.players[you].hand.length < MAX_HAND) {
        const [c] = f.splice(idx, 1);
        duelState.players[you].hand.push(toEntry(c, you === 'player2'));
      }
    }
  }

  // ---------- BUFFS FOR NEXT ATTACK ----------
  if (hasTag(meta, 'ammo_buff') || /buff.*next.*gun.*\+?10/.test(etext)) {
    duelState.players[you].buffs.gunFlatBonus = 10;
  }
  if (/double\s+the\s+damage\s+of\s+your\s+next\s+(sniper|scoped_pistol|hunting_rifle|silenced_rifle)/.test(etext)) {
    duelState.players[you].buffs.nextAttackMult = 2;
    duelState.players[you].buffs.attackRestrictTags = new Set(['sniper','scoped_pistol','hunting_rifle','silenced_rifle']);
  }
  if (/next\s+attack.*double\s+damage/.test(etext)) {
    duelState.players[you].buffs.nextAttackMult = 2;
    duelState.players[you].buffs.attackRestrictTags = null; // any attack
  }

  // ---------- SPECIAL LOOT EFFECTS ----------
  if (/select\s+1\s+loot\s+card.*destroy.*heal\s+15/.test(etext)) {
    // Cooking Pot: destroy one loot in hand to heal 15
    const P = duelState.players[you];
    const idx = P.hand.findIndex(e => txt(getMeta(e.cardId)?.type) === 'loot');
    if (idx >= 0) {
      const [c] = P.hand.splice(idx, 1);
      P.discardPile.push(c);
      changeHP(you, +15);
    }
  }
  if (/return.*gun.*discard.*draw\s+pile|refresh.*weapon.*discard/.test(etext)) {
    // Gun/Weapon Cleaning Kit
    moveOneFromDiscardToDeckTop(you, m => hasTag(m, 'gun') || txt(m.type) === 'attack');
  }
  if (/recharge.*tactical.*discard/.test(etext)) {
    moveOneFromDiscardToDeckTop(you, m => txt(m.type) === 'tactical');
  }
  if (/draw\s+1\s+random\s+loot\s+card\s+from\s+your\s+discard/.test(etext)) {
    drawFromDiscard(you, m => txt(m.type) === 'loot');
  }

  // ---------- INFECTED-SPECIFIC ----------
  if (type === 'infected') {
    if (/drain|siphon/.test(etext) || /you\s+lose\s+(\d+)\s*hp.*enemy\s+gains\s+(\d+)/.test(etext)) {
      changeHP(you, -10); changeHP(foe, +5);
    }
    if (/lose\s+next\s+draw|draw\s+phase/.test(etext)) {
      duelState.players[foe].buffs.skipNextDraw = true;
    }
    if (/skip\s+their\s+next\s+turn|cannot\s+play.*next\s+round|hand\s+lock/.test(etext)) {
      duelState.players[foe].buffs.skipNextTurn = true;
    }
    if (/spawn.*another.*infected|backup/.test(etext)) {
      // Try hand → deck → discard
      const trySpawn = (from, takeFn) => {
        const pool = from
          .map((e,i)=>({e,i,m:getMeta(typeof e==='object'?e.cardId:e)}))
          .filter(o=>txt(o.m.type)==='infected');
        if (!pool.length) return false;
        const pick = pool[Math.floor(Math.random()*pool.length)];
        const card = takeFn(pick.i);
        const entry = toEntry(card, you === 'player2');
        resolveImmediateEffect(getMeta(entry.cardId), you);
        return true;
      };
      const P = duelState.players[you];
      if (!trySpawn(P.hand, i=>P.hand.splice(i,1)[0])) {
        if (!trySpawn(P.deck, i=>P.deck.splice(i,1)[0])) {
          trySpawn(P.discardPile, i=>P.discardPile.splice(i,1)[0]);
        }
      }
    }
    if (/destroy.*(gear|armor).*card/.test(etext)) {
      const foeField = duelState.players[foe].field || [];
      const idx = foeField.findIndex(e => txt(getMeta(e.cardId)?.type) === 'defense');
      if (idx >= 0) {
        const [x] = foeField.splice(idx, 1);
        duelState.players[foe].discardPile.push(x);
        triggerAnimation('explosion');
      }
    }
  }

  // 🔊 per-card resolve SFX; temporarily suppress generic hit so it doesn't double up
  duelState._suppressGenericHit = true;
  setTimeout(() => { duelState._suppressGenericHit = false; }, 400);
  try { audio.playForCard(meta, 'resolve'); } catch {}
}

/* ---------- BOT/REMOTE PLAY RESOLVER (important) ---------- */
/**
 * Scan a player's field for cards that haven't been resolved on this client
 * (i.e., were placed by the bot/backend) and resolve them once.
 * This lets player2 plays trigger player1 traps on the UI.
 */
function resolveUnresolvedNonTrapsOnceFor(ownerKey) {
  const P = duelState.players?.[ownerKey];
  if (!P) return;
  ensureZones(P);
  const field = P.field || [];
  for (const card of field) {
    if (!card || card._resolvedByUI) continue;
    const meta = getMeta(typeof card === 'object' ? card.cardId : card);
    if (!meta || isTrapMeta(meta)) continue; // traps don't resolve here
    console.log('[auto-resolve]', { owner: ownerKey, cardId: card.cardId, name: meta?.name });

    // 1) Resolve the attacker/infected card first
    resolveImmediateEffect(meta, ownerKey);
    card._resolvedByUI = true;

    // 2) Then allow exactly one enemy trap to retaliate
    const t = txt(meta.type);
    if (t === 'attack' || t === 'infected') {
      const defender = ownerKey === 'player1' ? 'player2' : 'player1';
      triggerOneTrap(defender);
    }
  }
}

/** Wrap the renderer so we always apply any bot plays after render. */
function renderDuelUI() {
  _renderDuelUI();
  // process remote/bot plays that appeared in state
  resolveUnresolvedNonTrapsOnceFor('player2');
}

/** Safety net: poll in case updates arrive between our own renders. */
setInterval(() => {
  try {
    resolveUnresolvedNonTrapsOnceFor('player2');
  } catch (e) {
    // no-op
  }
}, 250);

/* ---------- start-of-turn auto draw (once per turn) ---------- */

/**
 * Draw exactly once at the start of the active player's turn and apply
 * per-turn start effects. Idempotent within a turn using a simple flag.
 * Returns true if a draw/updates happened this call; false if already done.
 */
export function startTurnIfNeeded() {
  const active = duelState.currentPlayer;
  if (!active) return false;

  // Flag bucket: which player already consumed their start-of-turn this cycle
  duelState._startDrawDoneFor ||= { player1: false, player2: false };
  if (duelState._startDrawDoneFor[active]) return false; // already handled

  const A = duelState.players[active];
  if (!A) return false;
  ensureZones(A);

  // ✅ Early exit if the active player has no hand AND no deck
  try {
    const noHand = !Array.isArray(A.hand) || A.hand.length === 0;
    const noDeck = !Array.isArray(A.deck) || A.deck.length === 0;
    if (noHand && noDeck) {
      const foe = active === 'player1' ? 'player2' : 'player1';
      duelState.winner = foe;
      renderDuelUI(); // summary overlay path in renderDuelUI
      return true;
    }
  } catch {}

  // Perform the automatic draw for the active player
  drawFor(active);

  // Extra draws from per-turn buffs (e.g., backpacks/vests)
  const extra = Number(A.buffs?.extraDrawPerTurn || 0);
  for (let i = 0; i < extra; i++) drawFor(active);

  // Decrement turn-limited buffs
  if (A.buffs.blockHealTurns > 0) A.buffs.blockHealTurns--;

  // Apply any start-of-turn effects (DOT ticks, etc.)
  try { applyStartTurnBuffs(); } catch (e) { console.warn('[startTurnIfNeeded] applyStartTurnBuffs error:', e); }

  // Mark as done so re-renders don't double-draw
  duelState._startDrawDoneFor[active] = true;

  return true;
}

/* ---------- end-of-turn cleanup ---------- */

function cleanupEndOfTurn(playerKey) {
  const P = duelState.players[playerKey];
  ensureZones(P);
  if (!Array.isArray(P.field) || !P.field.length) return;

  // Keep traps that have NOT fired (still set). Discard traps that fired.
  // Keep defenses (and any persistent/equip/gear/armor). Discard ephemerals.
  const keep = [];
  const toss = [];
  for (const card of P.field) {
    const meta = getMeta(typeof card === 'object' ? card.cardId : card);
    if (isTrapMeta(meta)) {
      if (card._fired) toss.push(card);
      else keep.push(card); // still set
    } else if (isPersistentOnField(meta)) {
      keep.push(card);
    } else {
      toss.push(card);
    }
  }

  if (toss.length) {
    P.discardPile.push(...toss);
    triggerAnimation('combo'); // subtle feedback
  }
  P.field = keep;
}

/* ---------- public actions ---------- */

/** Manual Draw button (still available in mock or debug) */
export function drawCard() {
  const who = duelState.currentPlayer; // 'player1' | 'player2'
  if (drawFor(who)) renderDuelUI();
}

/**
 * Play a card from the current player's hand to their field.
 * - Interactive plays allowed only for local human (player1)
 * - Field has 3 slots (UI guard)
 * - Traps stay face-down and DO NOT trigger immediately
 * - Non-traps resolve immediately; if they're Attack/Infected, they can trigger opponent traps AFTER resolving
 */
export function playCard(cardIndex) {
  const playerKey = duelState.currentPlayer;      // 'player1' | 'player2'
  const player    = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive plays for local human
  if (playerKey !== 'player1') return;

  ensureZones(player);

  if (!Array.isArray(player.hand) || cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }
  if (!Array.isArray(player.field)) player.field = [];
  if (player.field.length >= MAX_FIELD_SLOTS) {
    alert('Your field is full.');
    return;
  }

  // Take card from hand
  let card = player.hand.splice(cardIndex, 1)[0];
  // Normalize
  if (typeof card !== 'object' || card === null) {
    card = { cardId: pad3(card), isFaceDown: false };
  } else {
    card.cardId = pad3(card.cardId ?? card.id ?? card.card_id ?? '000');
  }

  const meta = getMeta(card.cardId);
  const trap = isTrapMeta(meta);

  // Place on field (traps face-down, others face-up)
  card.isFaceDown = trap ? true : false;
  player.field.push(card);

  if (trap) {
    // Traps never auto-trigger on play; they wait for enemy Attack/Infected.
    console.log(`🪤 Set trap: ${meta?.name ?? card.cardId} (face-down)`);
    triggerAnimation('trap');
    renderDuelUI();
    return;
  }

  // Resolve the played non-trap first
  resolveImmediateEffect(meta, playerKey);
  card._resolvedByUI = true;

  // Then allow exactly one enemy trap to retaliate
  const foe = playerKey === 'player1' ? 'player2' : 'player1';
  const type = txt(meta.type);
  if (type === 'attack' || type === 'infected') {
    triggerOneTrap(foe);
  }

  triggerAnimation('combo');
  renderDuelUI();
}

export function discardCard(cardIndex) {
  const playerKey = duelState.currentPlayer;
  const player = duelState.players[playerKey];
  if (!player) return;

  // Safety: only allow interactive discards for local human
  if (playerKey !== 'player1') return;

  ensureZones(player);

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    alert('Invalid card selection.');
    return;
  }

  const card = player.hand.splice(cardIndex, 1)[0];
  player.discardPile.push(card);

  const meta = getMeta(card.cardId);
  console.log(`🗑️ Discarded: ${meta?.name ?? card.cardId}`);
  renderDuelUI();
}

/**
 * End your turn.
 * Cleanup ephemeral field cards for the player who ended → swap players
 * → reset start-of-turn flags → handle skip → startTurnIfNeeded for the NEW player → render.
 */
export async function endTurn() {
  try {
    setControlsDisabled(true);

    // Player who is ending turn (cleanup applies to them)
    const ending = duelState.currentPlayer;
    const E = duelState.players[ending];
    ensureZones(E);

    // Discard ephemerals + fired traps at end of THIS player's turn
    cleanupEndOfTurn(ending);

    // Now pass the turn
    const next = ending === 'player1' ? 'player2' : 'player1';
    duelState.currentPlayer = next;

    // Reset start-of-turn flags so the new active can draw once
    duelState._startDrawDoneFor = { player1: false, player2: false };

    // Handle skip for the NEW active player
    const A = duelState.players[next];
    ensureZones(A);
    if (A.buffs.skipNextTurn) {
      console.log(`[turn] ${next} turn skipped.`);
      A.buffs.skipNextTurn = false;

      // Tick start-of-turn effects for the skipped player
      try { applyStartTurnBuffs(); } catch (e) { console.warn('[endTurn] applyStartTurnBuffs error:', e); }

      // Immediately pass back to the other player
      const back = next === 'player1' ? 'player2' : 'player1';
      duelState.currentPlayer = back;

      // Reset flags again for the now-active player and start their turn
      duelState._startDrawDoneFor = { player1: false, player2: false };
      startTurnIfNeeded();

      triggerAnimation('turn');
      renderDuelUI();
      return;
    }

    // Normal start-of-turn for the new active player (auto-draw once)
    startTurnIfNeeded();

    triggerAnimation('turn');
    renderDuelUI(); // bot turn will be kicked from renderDuelUI
  } finally {
    setControlsDisabled(false);
  }
}

// (Optional) also expose for any inline onclick fallbacks / external drivers
window.drawCard          = drawCard;
window.endTurn           = endTurn;
window.playCard          = playCard;
window.discardCard       = discardCard;
window.startTurnIfNeeded = startTurnIfNeeded;
window.resolveUnresolvedNonTrapsOnceFor = resolveUnresolvedNonTrapsOnceFor;
