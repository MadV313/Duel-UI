// scripts/animations.js — handles duel animation effects

// Toggle to let animations auto-trigger based on card tags (nice for testing)
const VISUAL_TEST_MODE = true;

// ———————————————————————————————————————————
// Lazy-load card metadata so we can map tags → animations
// ———————————————————————————————————————————
let allCardsIndex = Object.create(null);

(async () => {
  if (!VISUAL_TEST_MODE) return;
  try {
    const mod = await import('./allCards.js');
    const allCards = mod.default || [];
    for (const c of allCards) {
      if (!c) continue;
      allCardsIndex[c.card_id] = c;
    }
    console.log('✅ Visual testing mode: loaded allCards for animation tagging.');
  } catch (err) {
    console.warn('⚠️ Could not load allCards.js for visual animation testing:', err);
  }
})();

// Small helper to normalize tag shapes coming from JSON
function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  if (typeof tags === 'string') {
    return tags.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
  }
  // Objects or anything else: flatten keys that are truthy
  if (typeof tags === 'object') {
    return Object.keys(tags).filter(k => tags[k]).map(s => String(s).toLowerCase().trim());
  }
  return [];
}

// ———————————————————————————————————————————
// Core animation element spawner
// (CSS for the classes is assumed to exist in your styles)
// ———————————————————————————————————————————
function triggerAnimation(type) {
  const el = document.createElement('div');
  el.classList.add('animation', type);
  document.body.appendChild(el);

  // Tunable durations per type
  let duration = 1000;
  if (type === 'combo') duration = 1400;
  if (type === 'shield') duration = 1200;
  if (type === 'trap') duration = 1200;
  if (type === 'bullet') duration = 600;

  // Clean up after the effect finishes
  setTimeout(() => el.remove(), duration);
}

// ———————————————————————————————————————————
// Optional: derive animation from cardId via its tags
// (Only active if VISUAL_TEST_MODE === true)
// ———————————————————————————————————————————
function triggerAnimationByCard(cardId) {
  if (!VISUAL_TEST_MODE) return;
  const meta = allCardsIndex[cardId];
  if (!meta) return;

  const tags = normalizeTags(meta.tags);
  const has = (needle) => tags.includes(needle);
  const hasContains = (substr) => tags.some(t => t.includes(substr));

  // Map common tags -> animation types
  if (has('fire') || has('burn')) triggerAnimation('fire');
  if (has('explosive') || hasContains('explosion')) triggerAnimation('explosion');
  if (has('heal') || hasContains('heal_')) triggerAnimation('heal');
  if (has('trap')) triggerAnimation('trap');

  // “Shield-like” tags
  if (has('block') || has('armor_buff') || has('damage_reduction') || hasContains('immunity')) {
    triggerAnimation('shield');
  }

  // Ranged / melee cues
  if (has('gun') || hasContains('rifle') || has('crossbow')) triggerAnimation('bullet');
  if (has('melee')) triggerAnimation('attack');

  // Any combo_* tag should flash the combo glow
  if (tags.some(t => t.startsWith('combo_'))) triggerAnimation('combo');

  // Poison / gas vibes
  if (has('poison') || hasContains('poison') || has('gas')) triggerAnimation('poison');
}

// Supported direct triggers:
// triggerAnimation('attack');     // Melee attack pulse
// triggerAnimation('bullet');     // Gunfire flash
// triggerAnimation('heal');       // Healing aura
// triggerAnimation('fire');       // Burning effect
// triggerAnimation('explosion');  // Blast flash
// triggerAnimation('poison');     // Green toxic pulse
// triggerAnimation('shield');     // Defense/block flash
// triggerAnimation('trap');       // Trap trigger shake
// triggerAnimation('combo');      // Golden combo glow

export { triggerAnimation, triggerAnimationByCard };
