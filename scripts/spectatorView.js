// scripts/spectatorView.js — Renders the Duel UI in read-only mode for spectators

import { renderHand } from './renderHand.js';
import { renderField } from './renderField.js';
import { duelState } from './duelState.js';
import allCards from './allCards.js';

/* ---------------- token / url helpers (added) ---------------- */
const _qs = new URLSearchParams(location.search);
const PLAYER_TOKEN =
  _qs.get('token') ||
  (() => { try { return localStorage.getItem('sv13.token') || ''; } catch { return ''; } })();

try { if (PLAYER_TOKEN) localStorage.setItem('sv13.token', PLAYER_TOKEN); } catch {}

const API_OVERRIDE = _qs.get('api') || '';

/** Append token/api to a given URL string safely. */
function withTokenAndApi(url) {
  try {
    const u = new URL(url, location.origin);
    if (PLAYER_TOKEN) u.searchParams.set('token', PLAYER_TOKEN);
    if (API_OVERRIDE) u.searchParams.set('api', API_OVERRIDE.replace(/\/+$/, ''));
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    const parts = [];
    if (PLAYER_TOKEN) parts.push(`token=${encodeURIComponent(PLAYER_TOKEN)}`);
    if (API_OVERRIDE) parts.push(`api=${encodeURIComponent(API_OVERRIDE.replace(/\/+$/, ''))}`);
    return parts.length ? `${url}${sep}${parts.join('&')}` : url;
  }
}

/* ---------------- quick lookup by "003" id ---------------- */
const CARD_INDEX = Object.fromEntries(
  allCards.map(c => [String(c.card_id).padStart(3, '0'), c])
);

function asIdString(v) {
  return String(v).padStart(3, '0');
}

/**
 * Render the Duel UI in read-only mode (no interactions)
 */
export function renderSpectatorView() {
  // Render hands/fields with spectator=true to disable clicks
  renderHand('player1', true);
  renderHand('player2', true);
  renderField('player1', true);
  renderField('player2', true);

  // Update HP display
  const p1 = duelState?.players?.player1 ?? { hp: 200 };
  const p2 = duelState?.players?.player2 ?? { hp: 200 };
  const hp1El = document.getElementById('player1-hp');
  const hp2El = document.getElementById('player2-hp');
  if (hp1El) hp1El.textContent = p1.hp ?? 0;
  if (hp2El) hp2El.textContent = p2.hp ?? 0;

  // Turn banner
  const turnEl = document.getElementById('turn-display');
  if (turnEl) {
    turnEl.textContent = duelState?.winner
      ? `Winner: ${duelState.winner}`
      : `Current Turn: ${duelState?.currentPlayer ?? 'player1'}`;
  }

  // Winner (optional element)
  if (duelState?.winner) {
    const w = document.getElementById('winner-message');
    if (w) w.textContent = `${duelState.winner} wins the duel!`;
  }

  // Ensure the "Return to Hub" link preserves token/api for proper navigation back
  try {
    const hubLink = document.querySelector('.return-to-hub');
    if (hubLink && hubLink.href) {
      hubLink.href = withTokenAndApi(hubLink.href);
    }
  } catch {}

  // Light-weight visual cues based on cards on the field
  renderSpectatorAnimations();
}

/**
 * Adds simple CSS classes on <body> if certain card types/tags are present on the field.
 * This avoids incorrect references to a non-existent `card.effect` property.
 */
function renderSpectatorAnimations() {
  document.body.classList.remove('animation-attack', 'animation-shield');

  const p1Field = duelState?.players?.player1?.field ?? [];
  const p2Field = duelState?.players?.player2?.field ?? [];

  let hasAttackish = false;
  let hasShieldish = false;

  const scan = (arr) => {
    for (const entry of arr) {
      const id = asIdString(entry?.cardId ?? entry?.card_id ?? entry);
      const meta = CARD_INDEX[id];
      if (!meta) continue;

      const type = (meta.type || '').toLowerCase();
      const tags = Array.isArray(meta.tags)
        ? meta.tags.map(t => String(t).toLowerCase())
        : String(meta.tags || '').toLowerCase();

      // Heuristics for visuals
      if (type === 'attack' ||
          includesTag(tags, ['gun', 'melee', 'explosive', 'fire'])) {
        hasAttackish = true;
      }
      if (type === 'defense' ||
          includesTag(tags, ['block', 'armor', 'shield', 'damage_reduction', 'critical_immunity'])) {
        hasShieldish = true;
      }

      if (hasAttackish && hasShieldish) break;
    }
  };

  scan(p1Field);
  scan(p2Field);

  if (hasAttackish) document.body.classList.add('animation-attack');
  if (hasShieldish) document.body.classList.add('animation-shield');
}

function includesTag(tags, needles) {
  if (Array.isArray(tags)) {
    return tags.some(t => needles.includes(String(t).toLowerCase()));
  }
  // tags might be a comma-separated string from JSON
  return needles.some(n => String(tags).includes(n));
}
