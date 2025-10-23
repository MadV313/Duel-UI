// scripts/renderCard.js — handles visual rendering of cards for hand/field
import allCards from './allCards.js';

/* Helpers */
const ID_BACK = '000';
const CARD_BACK_SRC = 'images/cards/000_CardBack_Unique.png';
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
  const s = String(cardId).trim();
  // If it's already a 3+ char string, pad to at least 3 (keeps existing names like "095_*" upstream)
  return s.padStart(3, '0');
}

/** Fetch full card object by ID (returns undefined if not found) */
export function getCardById(cardId) {
  const idStr = normalizeId(cardId);
  return allCards.find(card => card.card_id === idStr);
}

/** Resolve an image URL for a card with fallbacks */
function resolveFrontImage(meta) {
  if (!meta) return null;

  // Known fields first
  const direct =
    meta.image ||
    meta.img ||
    meta.art ||
    null;

  if (direct && typeof direct === 'string') {
    return imgPath(direct);
  }

  // Last-chance fallback: try {id}.png if assets follow that convention
  const id = meta.card_id || null;
  if (id) {
    return imgPath(`${id}.png`);
  }

  return null;
}

/** Render a card node for hand or field */
export function renderCard(cardId, isFaceDown = false) {
  const idStr = normalizeId(cardId);
  const cardData = getCardById(idStr);
  const faceDownData = getCardById(ID_BACK); // keep for metadata fallback

  const cardEl = document.createElement('div');
  cardEl.classList.add('card');
  cardEl.dataset.cardId = idStr;
  cardEl.dataset.faceDown = String(!!isFaceDown);

  // Base metadata (used only when face-up)
  const resolved = (!isFaceDown && cardData) ? cardData : faceDownData || cardData;
  const tags = toTags(!isFaceDown ? resolved?.tags : []);

  // Classes for styling
  if (isFaceDown) {
    cardEl.classList.add('face-down');
  } else if (resolved?.type) {
    const t = String(resolved.type).toLowerCase();
    cardEl.classList.add(t);           // e.g. 'attack','defense','trap'
    cardEl.dataset.type = t;
  }

  // Tag hooks (e.g. .tag-trap, .tag-fire) — face-up only
  tags.forEach(t => cardEl.classList.add(`tag-${t.replace(/\s+/g, '_').toLowerCase()}`));

  // Image
  const img = document.createElement('img');
  img.classList.add('card-image');
  img.alt = isFaceDown ? 'Face-down card' : (resolved?.name || 'Unknown card');

  if (isFaceDown) {
    // ✅ Always show the dedicated back art when face-down
    img.src = CARD_BACK_SRC;
  } else {
    const primaryImg = resolveFrontImage(resolved);
    img.src = primaryImg || CARD_BACK_SRC;
    img.addEventListener('error', () => {
      if (img.src !== CARD_BACK_SRC) img.src = CARD_BACK_SRC;
    });
  }

  // Name label
  const name = document.createElement('div');
  name.classList.add('card-name');
  name.textContent = isFaceDown ? '' : (resolved?.name || 'Unknown');
  // Extra data hooks for debugging/inspection
  if (!isFaceDown) {
    if (resolved?.name) cardEl.dataset.name = resolved.name;
    if (resolved?.rarity) cardEl.dataset.rarity = String(resolved.rarity).toLowerCase();
  }

  // Small tooltip via title (effect text is handy in practice mode)
  if (!isFaceDown && resolved?.effect) {
    const effect = String(resolved.effect || '').trim();
    if (effect) {
      cardEl.title = `${resolved.name}\n${effect}`;
    } else {
      cardEl.title = resolved.name || '';
    }
  } else if (isFaceDown) {
    cardEl.title = 'Face-down card';
  }

  // Subtle visual cues for notable tags (face-up only)
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
