// scripts/audio.js
const DEFAULTS = {
  bgSrc: '/audio/bg/Follow the Trail.mp3',
  sfxBase: '/audio/sfx/',
  volume: 0.65,     // sfx volume
  bgVolume: 0.35,   // bg volume
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
function makeAudio(src, vol) {
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = Math.max(0, Math.min(1, vol));
  a.muted = store.muted;
  return a;
}

function getPrimed(url) {
  let a = cache.get(url);
  if (!a) {
    a = makeAudio(url, store.volume);
    cache.set(url, a);
  }
  // clone so multiple same SFX can overlap
  const inst = a.cloneNode(true);
  inst.volume = store.muted ? 0 : store.volume;
  inst.muted = store.muted;
  return inst;
}

function makeBg(src) {
  if (bgAudio) try { bgAudio.pause(); } catch {}
  bgAudio = makeAudio(src, store.bgVolume);
  bgAudio.loop = true;
  return bgAudio;
}

function safePlay(a) {
  if (!a) return;
  // browsers require a user gesture before first play — we “unlock” below
  a.play().catch(() => {});
}

function installUnlockOnce() {
  if (store._unlockInstalled) return;
  store._unlockInstalled = true;
  const unlock = () => {
    store.unlocked = true;
    if (!bgAudio) makeBg(DEFAULTS.bgSrc);
    safePlay(bgAudio);
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
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
    // allow comma-separated convenience in JSON
    list = value.split(',').map(s => s.trim()).filter(Boolean);
  } else if (typeof value === 'object') {
    // unexpected, ignore here (handled earlier)
    return null;
  }

  list = list.map(pathify).filter(Boolean);
  if (!list.length) return null;
  const pick = list[Math.floor(Math.random() * list.length)];
  return pick;
}

const KEY_SYNONYMS = {
  // attempt to be forgiving with JSON keys
  play: 'place',
  trigger: 'fire',
  attack: 'resolve',
  shot: 'resolve',
  hit: 'resolve',
  remove: 'discard',
  toss: 'discard',
};

function readSfxMap(meta) {
  const map = (meta?.sfx ?? meta?.audio);
  if (!map) return null;

  if (typeof map === 'string' || Array.isArray(map)) {
    // Single value means "use for whatever event is requested"
    return { __default: map };
  }

  if (typeof map === 'object') {
    // normalize keys + synonyms
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
    if (t === 'attack' || tags.has('gun') || tags.has('infected')) fallback = 'attack_hit.mp3';
    else if (t === 'defense' || t === 'tactical' || t === 'loot') fallback = 'card_place.mp3';
  }

  const url = pathify(fallback);
  if (store.debug && url) console.log('[audio] fallback', ev, '→', url, meta?.name);
  return url;
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

  // SFX
  play(nameOrUrl) {
    // allow array input here too
    if (Array.isArray(nameOrUrl)) {
      const pick = chooseOneSfx(nameOrUrl);
      if (!pick) return;
      const a = getPrimed(pick);
      safePlay(a);
      return;
    }

    const url = pathify(nameOrUrl);
    if (!url) return;
    const a = getPrimed(url);
    safePlay(a);
  },
  playForCard(meta, event = 'resolve') {
    const url = sfxByType(meta, event);
    if (url) this.play(url);
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
