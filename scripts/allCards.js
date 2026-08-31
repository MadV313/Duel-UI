// scripts/allCards.js — canonical card master with a narrow local SFX overlay.
// CoreMasterReference.json owns gameplay metadata. scripts/allCards.json may only augment
// presentation-only SFX fields retained by the Duel UI.

async function fetchJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.cards)) return value.cards;
  return [];
}

function byId(cards) {
  const map = new Map();
  for (const card of cards || []) {
    if (!card?.card_id) continue;
    map.set(String(card.card_id).padStart(3, '0'), card);
  }
  return map;
}

export async function loadAllCardsJSON() {
  let master = [];
  try {
    master = asArray(await fetchJSON('./CoreMasterReference.json'));
  } catch (err) {
    console.warn('[cards] canonical master unavailable:', err);
  }

  let overlay = [];
  try {
    overlay = asArray(await fetchJSON('./scripts/allCards.json'));
  } catch (err) {
    console.warn('[cards] SFX overlay unavailable:', err);
  }

  // If the canonical master is missing, keep the old bundled data as an emergency
  // metadata fallback so card rendering degrades to existing behavior instead of blanking.
  const base = master.length ? master : overlay;
  const overlayMap = byId(overlay);
  const merged = base.map(card => {
    const extra = overlayMap.get(String(card.card_id).padStart(3, '0'));
    return extra?.sfx ? { ...card, sfx: extra.sfx } : { ...card };
  });

  try { window.__ALL_CARDS__ = merged; } catch {}
  console.log('[cards] canonical=', master.length, 'overlay=', overlay.length, 'resolved=', merged.length);
  return merged;
}

const __ALL = await loadAllCardsJSON();
export default __ALL;
