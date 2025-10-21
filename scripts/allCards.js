// scripts/allCards.js
// Fetch-only loader for allCards.json (no JSON-module import).
// Works on GitHub Pages, Railway, and local dev without MIME warnings.

/* global fetch */
export async function loadAllCardsJSON({ base = '' } = {}) {
  // Try a couple of sensible locations. You can add more if needed.
  const candidates = [
    `${base}/scripts/allCards.json`,
    `/scripts/allCards.json`,
    `./scripts/allCards.json`, // relative to current page
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) || (data && typeof data === 'object')) {
        return data;
      }
    } catch (_) {
      // swallow and try next candidate
    }
  }

  console.warn('[allCards] Could not load allCards.json from any candidate URL.');
  return []; // safe fallback so the UI can still run
}

// Optional: default export is the loader function, so
// import allCards from './allCards.js' still works if you call it.
// Usage: const list = await allCards();
export default loadAllCardsJSON;
