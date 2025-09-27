// scripts/audio.js
const DEFAULTS = {
  bgSrc: '/audio/bg/Follow the Trail.mp3',
  sfxBase: '/audio/sfx/',
  volume: 0.65,        // sfx volume
  bgVolume: 0.35,      // bg volume
  gapMs: 180,          // spacing between queued SFX for queued channels
  sfxTimeoutMs: 4000,  // fallback if 'ended' never fires
  coinFlipFile: 'coin_flip.mp3', // new: coin flip sfx name (relative to sfxBase unless absolute)
};

const store = {
  muted: JSON.parse(localStorage.getItem('audio.muted') || 'false'),
  volume: Number(localStorage.getItem('audio.vol') || DEFAULTS.volume),
  bgVolume: Number(localStorage.getItem('audio.bgvol') || DEFAULTS.bgVolume),
  unlocked: false,
  _unlockInstalled: false,
  debug: false, // flip to true to see mapping logs
};

const cache = new Map(); // url -> HTMLAudioElement (primed)
let bgAudio = null;

/* ---------------- internals ---------------- */
const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));

// Listeners waiting for unlock (to retry play() if it was gesture-blocked)
const unlockWaiters = [];
function whenUnlocked() {
  if (store.unlocked) return Promise.resolve();
  return new Promise(res => unlockWaiters.push(res));
}

function makeAudio(src, vol) {
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = Math.max(0, Math.min(1, vol));
  a.muted = store.muted;
  a.addEventListener('error', (e) => {
    // Give a helpful path hint in console for missing files
    console.warn('[audio] element error for', src, e?.message || e);
  }, { once: true });
  return a;
}

function getPrimed(url) {
  let a = cache.get(url);
  if (!a) {
    a = makeAudio(url, store.volume);
    cache.set(url, a);
    // Nudge fetch; if blocked, it's fine—we'll retry on first play()
    try { a.load(); } catch {}
  }
  // clone so multiple same SFX can overlap
  const inst = a.cloneNode(true);
  inst.volume = store.muted ? 0 : store.volume;
  inst.muted = store.muted;
  // ensure fresh start
  try { inst.currentTime = 0; } catch {}
  return inst;
}

function makeBg(src) {
  if (bgAudio) try { bgAudio.pause(); } catch {}
  bgAudio = makeAudio(src, store.bgVolume);
  bgAudio.loop = true;
  return bgAudio;
}

// Robust play that retries after user-gesture unlock if blocked
function safePlay(a) {
  if (!a) return Promise.resolve(false);
  const tryOnce = () => a.play().then(() => true).catch(async (err) => {
    const blocked = !store.unlocked || String(err?.name).includes('NotAllowed');
    if (blocked) {
      if (store.debug) console.log('[audio] play() blocked; waiting for unlock');
      await whenUnlocked();
      try { await a.play(); return true; } catch (e2) {
        console.warn('[audio] play() failed after unlock:', e2?.message || e2);
        return false;
      }
    }
    console.warn('[audio] play() error:', err?.message || err);
    return false;
  });
  return tryOnce();
}

function installUnlockOnce() {
  if (store._unlockInstalled) return;
  store._unlockInstalled = true;
  const unlock = async () => {
    store.unlocked = true;
    if (!bgAudio) makeBg(DEFAULTS.bgSrc);
    try { await bgAudio.play(); } catch {}
    // Resolve pending waiters
    while (unlockWaiters.length) {
      try { unlockWaiters.shift()?.(); } catch {}
    }
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  const opts = { once: true, passive: true, capture: true };
  document.addEventListener('pointerdown', unlock, opts);
  document.addEventListener('keydown', unlock, opts);
  document.addEventListener('touchstart', unlock, opts);
}

function pathify(input) {
  // accepts a short name ("attack_hit.mp3") or absolute/relative url
  if (!input) return null;
  if (typeof input !== 'string') return null;
  if (/^https?:|^\//.test(input)) return input;
  return (DEFAULTS.sfxBase || '') + input.trim();
}

// Accepts:
//   - string  ("shot.mp3" or "shot.mp3, muzzle.wav")
//   - array   (["shot1.mp3","shot2.mp3"])
// Returns a single random, already pathified URL string (or null)
function chooseOneSfx(value) {
  if (!value) return null;

  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    list = value.split(',').map(s => s.trim()).filter(Boolean);
  } else if (typeof value === 'object') {
    return null;
  }

  list = list.map(pathify).filter(Boolean);
  if (!list.length) return null;
  const pick = list[Math.floor(Math.random() * list.length)];
  return pick;
}

// Broader synonym coverage (more tolerant mapping)
const KEY_SYNONYMS = {
  play: 'place',
  set: 'place',
  arm: 'place',
  place: 'place',

  trigger: 'fire',
  activated: 'fire',
  activation: 'fire',
  flip: 'fire',
  proc: 'fire',
  fired: 'fire',

  attack: 'resolve',
  shot: 'resolve',
  hit: 'resolve',
  resolve: 'resolve',

  remove: 'discard',
  toss: 'discard',
  clear: 'discard',
  destroyed: 'discard',
};

function readSfxMap(meta) {
  const map = (meta?.sfx ?? meta?.audio);
  if (!map) return null;

  if (typeof map === 'string' || Array.isArray(map)) {
    return { __default: map };
  }

  if (typeof map === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const key = String(KEY_SYNONYMS[k] || k).toLowerCase();
      out[key] = v;
    }
    return out;
  }
  return null;
}

/**
 * Decide which SFX to play for a given card + event.
 * Priority:
 *  1) allCards.json meta.sfx / meta.audio (string, array, or {event: value})
 *  2) fallbacks by event/type/tags
 */
function sfxByType(meta, event = 'resolve') {
  const ev = String(event).toLowerCase();

  // 1) explicit per-card mapping
  const m = readSfxMap(meta);
  if (m) {
    const specific = m[ev] ?? m.__default;
    const chosen = chooseOneSfx(specific);
    if (chosen) {
      if (store.debug) console.log('[audio] per-card', ev, '→', chosen, meta?.name);
      return chosen;
    }
  }

  // 2) fallbacks by event/type/tag
  const t = String(meta?.type || '').toLowerCase();
  const tags = new Set(
    (Array.isArray(meta?.tags) ? meta.tags : String(meta?.tags || '').split(','))
      .map(x => String(x).trim().toLowerCase())
      .filter(Boolean)
  );

  let fallback = null;
  if (ev === 'place') {
    fallback = (t === 'trap' || tags.has('trap')) ? 'trap_set.mp3' : 'card_place.mp3';
  } else if (ev === 'fire') {
    fallback = 'trap_fire.mp3';
  } else if (ev === 'discard') {
    fallback = 'discard.mp3';
  } else if (ev === 'resolve') {
    // IMPORTANT: do NOT auto-map attacks/infected to attack_hit.mp3.
    // The single end-of-turn hit cue is handled in duel.js.
    if (t === 'defense' || t === 'tactical' || t === 'loot') {
      fallback = 'card_place.mp3';
    } else {
      fallback = null; // no generic resolve SFX for attack/infected
    }
  }

  const url = pathify(fallback);
  if (store.debug && url) console.log('[audio] fallback', ev, '→', url, meta?.name);
  return url;
}

/* ---------------- channel mixer ----------------
   - default: queued (pacing)
   - trap:    overlap (mix immediately)
   - ui:      overlap (UI blips like coin flip)
-------------------------------------------------*/
const channels = new Map(); // name -> { queue: [], processing: false }

// small dedupe window to avoid accidental double-fires in same tick (general)
const recentFire = new Map(); // key/url -> ts

// semantic per-sound dedupe windows (ms)
const SEMANTIC_DEDUPE = [
  { test: /attack_hit\.mp3$/i, window: 260, key: 'attack_hit' }, // fixes double “hit” from explicit + fallback
  { test: /trap_fire\.mp3$/i,  window: 60,  key: 'trap_fire' },  // allow quick successive traps but avoid micro-dupes
  { test: /card_place\.mp3$/i, window: 100, key: 'card_place' },
  { test: /trap_set\.mp3$/i,   window: 100, key: 'trap_set' },
];

function dedupeKeyForUrl(url) {
  try {
    const file = url.split('?')[0].split('/').pop() || url;
    for (const rule of SEMANTIC_DEDUPE) {
      if (rule.test.test(file)) return { key: rule.key, window: rule.window };
    }
  } catch {}
  // default/fallback window for identical URLs
  return { key: url, window: 100 };
}

function getChannelState(name = 'default') {
  let s = channels.get(name);
  if (!s) {
    s = { queue: [], processing: false };
    channels.set(name, s);
  }
  return s;
}

function _playOneUrl(url) {
  if (!url || store.muted) return Promise.resolve();
  const { key, window } = dedupeKeyForUrl(url);

  const now = performance.now();
  const last = recentFire.get(key) || 0;
  if (now - last < window) {
    if (store.debug) console.log('[audio] dedupe skip', key, '→', url);
    return Promise.resolve();
  }
  recentFire.set(key, now);

  const a = getPrimed(url);

  return new Promise(res => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      clearTimeout(tid);
      res();
    };
    const onEnd = () => cleanup();
    const onErr = (e) => {
      console.warn('[audio] playback error for', url, e?.message || e);
      cleanup();
    };

    a.addEventListener('ended', onEnd, { once: true });
    a.addEventListener('error', onErr, { once: true });

    // Fallback timeout
    const durMs = Number.isFinite(a.duration) && a.duration > 0
      ? Math.ceil(a.duration * 1000) + 50
      : DEFAULTS.sfxTimeoutMs;
    const tid = setTimeout(() => {
      if (store.debug) console.log('[audio] timeout ended for', url);
      cleanup();
    }, durMs);

    // Attempt play; if blocked, safePlay() retries after unlock
    safePlay(a).then(() => {}).catch(() => {});
  });
}

/**
 * Enqueue or overlap-play a URL on a named channel.
 * opts:
 *  - channel: 'default' | 'trap' | 'ui' | <custom>
 *  - policy:  'queue' (serialize) | 'overlap' (play immediately)
 *  - gapMs:   inter-item delay for queued playback
 */
function _enqueueUrl(url, { gapMs, channel = 'default', policy = 'queue' } = {}) {
  if (!url) return Promise.resolve();

  if (policy === 'overlap') {
    // play immediately, independent of any queue
    return _playOneUrl(url);
  }

  const ch = getChannelState(channel);
  const item = {
    url,
    gapMs: Number.isFinite(gapMs) ? gapMs : DEFAULTS.gapMs,
  };

  return new Promise(resolve => {
    item._resolve = resolve;
    ch.queue.push(item);
    if (!ch.processing) _processChannel(channel);
  });
}

async function _processChannel(channel = 'default') {
  const ch = getChannelState(channel);
  if (ch.processing) return;
  ch.processing = true;
  try {
    while (ch.queue.length) {
      const { url, gapMs, _resolve } = ch.queue.shift();

      if (!url || store.muted) {
        try { _resolve?.(); } catch {}
        if (gapMs > 0) await sleep(gapMs);
        continue;
      }

      await _playOneUrl(url);
      try { _resolve?.(); } catch {}
      if (gapMs > 0) await sleep(gapMs);
    }
  } finally {
    ch.processing = false;
  }
}

/* ------------- channel routing helpers ------------- */
function classifyChannelFor(meta, event, given = {}) {
  const ev = String(event || 'resolve').toLowerCase();
  const type = String(meta?.type || '').toLowerCase();

  // default routing
  let channel = 'default';
  let policy = 'queue';

  // Traps should cut through and mix on their own lane.
  if (ev === 'fire' || type === 'trap') {
    channel = 'trap';
    policy = 'overlap';
  }

  // “UI blips” can overlap (coin flip, button clicks if you add those later)
  if (given.channel === 'ui') {
    channel = 'ui';
    policy = given.policy || 'overlap';
  }

  // allow explicit overrides from caller
  if (given.channel && given.channel !== 'ui') channel = given.channel;
  if (given.policy && given.channel !== 'ui') policy = given.policy;

  return { channel, policy, gapMs: given.gapMs };
}

/* ---------------- public API ---------------- */
export const audio = {
  configure(opts = {}) {
    Object.assign(DEFAULTS, opts);
    if (!bgAudio) makeBg(DEFAULTS.bgSrc);
  },
  initAutoplayUnlock() { installUnlockOnce(); }, // call once at startup

  // BG music
  startBg(src) {
    if (src) makeBg(src);
    if (!bgAudio) makeBg(DEFAULTS.bgSrc);
    safePlay(bgAudio);
  },
  stopBg() { try { bgAudio?.pause(); } catch {} },
  isBgPlaying() { return !!(bgAudio && !bgAudio.paused); },

  // SFX (supports channels)
  play(nameOrUrl, opts = {}) {
    // allow array input (pick one randomly)
    if (Array.isArray(nameOrUrl)) {
      const pick = chooseOneSfx(nameOrUrl);
      if (!pick) return Promise.resolve();
      return _enqueueUrl(pick, opts);
    }
    const url = pathify(nameOrUrl);
    if (!url) return Promise.resolve();
    return _enqueueUrl(url, opts);
  },

  playForCard(meta, event = 'resolve', opts = {}) {
    const url = sfxByType(meta, event);
    if (!url) return Promise.resolve();
    const routed = classifyChannelFor(meta, event, opts);
    return _enqueueUrl(url, routed);
  },

  /** NEW: force the trap “fire” sound in the trap channel with overlap */
  playTrapSfx(meta, opts = {}) {
    const url = sfxByType(meta, 'fire');
    if (!url) return Promise.resolve();
    return _enqueueUrl(url, { ...opts, channel: 'trap', policy: 'overlap' });
  },

  /** NEW: coin flip helper (use when you show the GIF) */
  coinFlip() {
    const url = pathify(DEFAULTS.coinFlipFile);
    return _enqueueUrl(url, { channel: 'ui', policy: 'overlap' });
  },

  // Convenience: queue multiple steps in order on a chosen channel
  async sequence(steps = [], { gapMs, channel = 'default', policy = 'queue' } = {}) {
    for (const step of steps) {
      if (!step) continue;
      const baseOpts = { gapMs, channel, policy };
      if (typeof step === 'string' || Array.isArray(step)) {
        await this.play(step, baseOpts);
      } else if (step.meta) {
        const ev = step.event || 'resolve';
        await this.playForCard(step.meta, ev, { ...baseOpts, ...step.opts });
      } else if (step.url) {
        await this.play(step.url, baseOpts);
      }
    }
  },

  clearQueue() {
    // clear all channels
    for (const ch of channels.values()) ch.queue.length = 0;
  },

  // Volume / mute
  setMuted(m) {
    store.muted = !!m;
    localStorage.setItem('audio.muted', JSON.stringify(store.muted));
    if (bgAudio) bgAudio.muted = store.muted;
  },
  toggleMute() { this.setMuted(!store.muted); },
  setVolume(v) {
    store.volume = Math.max(0, Math.min(1, Number(v)));
    localStorage.setItem('audio.vol', String(store.volume));
  },
  setBgVolume(v) {
    store.bgVolume = Math.max(0, Math.min(1, Number(v)));
    localStorage.setItem('audio.bgvol', String(store.bgVolume));
    if (bgAudio) bgAudio.volume = store.bgVolume;
  },
  setDebug(on) { store.debug = !!on; },
};

// Optional: a tiny UI toggle (top-right speaker)
export function installSoundToggleUI() {
  if (document.getElementById('sound-toggle')) return;
  const btn = document.createElement('button');
  btn.id = 'sound-toggle';
  btn.type = 'button';
  btn.title = 'Toggle sound';
  btn.style.cssText = `
    position:fixed; right:14px; top:14px; z-index:10001;
    width:40px;height:40px;border-radius:10px;border:1px solid #2b3946;
    background:#101820;color:#dfe7ef;cursor:pointer;font-size:18px;`;
  const updateIcon = () => btn.textContent = store.muted ? '🔇' : '🔊';
  btn.onclick = () => { audio.toggleMute(); updateIcon(); };
  updateIcon();
  document.body.appendChild(btn);
}
