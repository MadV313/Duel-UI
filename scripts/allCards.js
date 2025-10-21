// scripts/allCards.js
// Unified loader with full backward compatibility.
// - No "import ... assert { type: 'json' }" (avoids MIME warning).
// - Named export:  loadAllCardsJSON()  → Promise<array>
// - Default export: the resolved array (via top-level await)
// - Mirrors result to window.__ALL_CARDS__ for legacy reads.

const CANDIDATES = [
  '/scripts/allCards.json',
  './scripts/allCards.json',
  './allCards.json',
  '/allCards.json',
];

/** Fetch and parse allCards.json from a few candidate paths. */
export async function loadAllCardsJSON() {
  let lastErr;
  for (const url of CANDIDATES) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        try { window.__ALL_CARDS__ = json; } catch {}
        console.log('[allCards] loaded from', url, 'count=', json.length);
        return json;
      }
      // Some builds may ship as {cards:[...]} – tolerate that
      if (json && Array.isArray(json.cards)) {
        try { window.__ALL_CARDS__ = json.cards; } catch {}
        console.log('[allCards] loaded from', url, 'count=', json.cards.length);
        return json.cards;
      }
      throw new Error('Not an array');
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[allCards] failed to load from candidates:', lastErr);
  try { window.__ALL_CARDS__ = []; } catch {}
  return [];
}

// Default export preserves old `import allCards from './allCards.js'` usage.
const __ALL = await loadAllCardsJSON();
export default __ALL;
