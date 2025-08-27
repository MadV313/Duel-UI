// scripts/allCards.js
// Robust JSON loader with a safe fallback for environments that
// don’t fully support `import ... assert { type: "json" }`.

let cards;

try {
  // Prefer native JSON module import (modern browsers)
  const mod = await import('./allCards.json', { assert: { type: 'json' } });
  cards = mod.default;
} catch (err) {
  // Fallback: fetch the JSON file directly
  console.warn('[allCards] JSON import failed, falling back to fetch:', err?.message || err);
  const url = new URL('./allCards.json', import.meta.url);
  const res = await fetch(url.toString(), { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`[allCards] Failed to load allCards.json: ${res.status} ${await res.text().catch(()=>'')}`);
  }
  cards = await res.json();
}

export default cards;
