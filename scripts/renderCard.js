// scripts/renderCard.js — handles visual rendering of cards for hand/field
import allCards from './allCards.js';

/* Helpers */
const ID_BACK = '000';
const imgPath = (img) => `images/cards/${img}`;

// Normalize "tags" to an array (JSON sometimes has comma-strings)
function toTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return String(val)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeId(cardId) {
  if (cardId == null) return ID_BACK;
  // Accept numeric, "7", "007", etc.
  const n = Number(cardId);
  if (!Number.isNaN(n)) return String(n).padStart(3, '0');
  return String(cardId).padStart(3, '0');
}

/** Fetch full card object by ID (returns undefined if not found) */
export function getCardById(cardId) {
  const idStr = normalizeId(cardId);
  return allCards.find(card => card.card_id === idStr);
}

/** Render a card node for hand or field */
export function renderCard(cardId, isFaceDown = false) {
  const cardData = getCardById(cardId);
  const faceDownData = getCardById(ID_BACK);

  const cardEl = document.createElement('div');
  cardEl.classList.add('card');

  // Base metadata
  const resolved = (!isFaceDown && cardData) ? cardData : faceDownData || cardData;
  const tags = toTags(resolved?.tags);

  // Classes for styling
  if (isFaceDown) {
    cardEl.classList.add('face-down');
  } else if (resolved?.type) {
    cardEl.classList.add(String(resolved.type).toLowerCase()); // e.g. 'attack','defense','trap'
  }
  // Tag hooks (e.g. .tag-trap, .tag-fire)
  tags.forEach(t => cardEl.classList.add(`tag-${t.replace(/\s+/g, '_').toLowerCase()}`));

  // Data attributes for debugging / future hooks
  cardEl.dataset.cardId = normalizeId(cardId);
  if (resolved?.type) cardEl.dataset.type = String(resolved.type).toLowerCase();

  // Image
  const img = document.createElement('img');
  img.classList.add('card-image');
  img.alt = isFaceDown ? 'Face-down card' : (resolved?.name || 'Unknown card');

  // Prefer resolved image; fallback to back
  const primaryImg = resolved?.image ? imgPath(resolved.image) : null;
  const fallbackImg = faceDownData?.image ? imgPath(faceDownData.image) : primaryImg;
  img.src = primaryImg || fallbackImg || '';

  img.addEventListener('error', () => {
    // Last-resort fallback
    if (img.src !== fallbackImg && fallbackImg) {
      img.src = fallbackImg;
    }
  });

  // Name label
  const name = document.createElement('div');
  name.classList.add('card-name');
  name.textContent = isFaceDown ? '' : (resolved?.name || 'Unknown');

  // Small tooltip via title (effect text is handy in practice mode)
  if (!isFaceDown && resolved?.effect) {
    cardEl.title = `${resolved.name}\n${resolved.effect}`;
  } else if (isFaceDown) {
    cardEl.title = 'Face-down card';
  }

  // Subtle visual cues for notable tags
  if (!isFaceDown && tags.length) {
    const hasCombo = tags.includes('combo_sniper') || tags.includes('combo_buff') || tags.includes('combo_crit');
    const hasDamageFX = tags.includes('fire') || tags.includes('explosion') || tags.includes('poison');
    if (hasCombo) cardEl.classList.add('combo-glow');
    if (hasDamageFX) cardEl.classList.add('damage-glow');
  }

  cardEl.appendChild(img);
  cardEl.appendChild(name);
  return cardEl;
}
