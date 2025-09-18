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
};

const cache = new Map(); // url -> HTMLAudioElement (primed)
let bgAudio = null;

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
  if (/^https?:|^\//.test(input)) return input;
  return DEFAULTS.sfxBase + input;
}

function sfxByType(meta, event='resolve') {
  // If allCards.json has audio hints, prefer those
  const a = meta?.audio || meta?.sfx;
  if (typeof a === 'string') return pathify(a);
  if (a && a[event]) return pathify(a[event]);

  // fallbacks by event/type/tag
  const t = String(meta?.type || '').toLowerCase();
  const name = String(meta?.name || '').toLowerCase();
  const tags = new Set(
    (Array.isArray(meta?.tags) ? meta.tags : String(meta?.tags || '').split(','))
      .map(x => String(x).trim().toLowerCase())
      .filter(Boolean)
  );

  if (event === 'place')  return pathify(t === 'trap' ? 'trap_set.mp3' : 'card_place.mp3');
  if (event === 'fire')   return pathify('trap_fire.mp3');
  if (event === 'resolve') {
    if (t === 'attack' || tags.has('infected')) return pathify('attack_hit.mp3');
    if (t === 'defense')  return pathify('card_place.mp3');
    if (t === 'tactical') return pathify('card_place.mp3');
  }
  return null;
}

export const audio = {
  configure(opts={}) {
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
    const url = pathify(nameOrUrl);
    if (!url) return;
    const a = getPrimed(url);
    safePlay(a);
  },
  playForCard(meta, event='resolve') {
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
  const updateIcon = () => btn.textContent = (JSON.parse(localStorage.getItem('audio.muted')||'false')) ? '🔇' : '🔊';
  btn.onclick = () => { audio.toggleMute(); updateIcon(); };
  updateIcon();
  document.body.appendChild(btn);
}
