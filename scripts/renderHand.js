// scripts/renderHand.js — renders a player's hand (with Play/Discard picker)
import { renderCard } from './renderCard.js';
import { duelState } from './duelState.js';
import { playCard, discardCard } from './duel.js';

function asIdString(cardId) {
  return String(cardId).padStart(3, '0');
}

/* ---------- lightweight action menu (singleton) ---------- */
function getActionMenu() {
  let menu = document.getElementById('card-action-menu');
  if (menu) return menu;

  menu = document.createElement('div');
  menu.id = 'card-action-menu';
  menu.className = 'card-action-menu hidden';
  menu.innerHTML = `
    <button data-action="play"    type="button">Play</button>
    <button data-action="discard" type="button">Discard</button>
  `;
  document.body.appendChild(menu);

  // stop clicks inside from bubbling to the document
  menu.addEventListener('click', (e) => e.stopPropagation());

  // close on outside click
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden')) {
      if (!menu.contains(e.target) && !e.target.closest('.card')) {
        hideActionMenu();
      }
    }
  });

  // close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideActionMenu();
  });

  // auto-hide on scroll/resize to avoid floating in wrong place
  window.addEventListener('scroll', hideActionMenu, { passive: true });
  window.addEventListener('resize', hideActionMenu);

  return menu;
}

function hideActionMenu() {
  const menu = document.getElementById('card-action-menu');
  if (menu) {
    menu.classList.add('hidden');
    menu.style.left = menu.style.top = '';
    menu.removeAttribute('data-player');
    menu.removeAttribute('data-index');
  }
  // remove any previous selected highlight
  document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
}

function showActionMenuFor(el, player, index) {
  const menu = getActionMenu();

  // position menu above the card, centered
  const rect = el.getBoundingClientRect();
  const top = window.scrollY + rect.top - 8; // a bit above the card
  const left = window.scrollX + rect.left + rect.width / 2;

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.classList.remove('hidden');
  menu.dataset.player = player;
  menu.dataset.index = String(index);

  // mark selected
  document.querySelectorAll('.card.selected').forEach(n => n.classList.remove('selected'));
  el.classList.add('selected');

  // wire actions (rebind each time to use fresh indices)
  const playBtn = menu.querySelector('[data-action="play"]');
  const discBtn = menu.querySelector('[data-action="discard"]');

  playBtn.onclick = () => {
    hideActionMenu();
    if (player !== 'player1') return; // only local player can play from UI
    playCard(index);
  };
  discBtn.onclick = () => {
    hideActionMenu();
    if (player !== 'player1') return;
    discardCard(index);
  };
}

/* ---------- discard counter helpers ---------- */
function getOrCreateDiscardCounter(container, player) {
  // one counter per hand container; keep it stable across renders
  const id = `${player}-discard-counter`;
  let node = container.querySelector(`#${id}`);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.className = 'discard-counter';
    // mild default styling hook; rely on existing CSS to place/size
    // (e.g., .discard-counter { margin-top: .5rem; font-size: 0.9rem; opacity: .8; })
    container.appendChild(node);
  }
  return node;
}

function updateDiscardCounter(container, player) {
  try {
    const pile = Array.isArray(duelState?.players?.[player]?.discardPile)
      ? duelState.players[player].discardPile
      : [];
    const count = pile.length;

    // Keep the counter present even if 0 — that’s useful for testing
    const el = getOrCreateDiscardCounter(container, player);
    el.textContent = `Discard: ${count}`;
    el.dataset.count = String(count);
  } catch {
    // noop
  }
}

/**
 * Render the hand for a given player.
 * - When `isSpectator` is true, clicks are disabled.
 * - Opponent (player2) hand is auto face-down for non-spectators.
 * - Accepts card entries as objects ({cardId,isFaceDown}) or raw ids.
 * - Adds data-* attributes for easier debugging/inspection.
 * - Always renders a discard counter under the hand.
 */
export function renderHand(player, isSpectator = false) {
  const handContainer = document.getElementById(`${player}-hand`);
  if (!handContainer) return;

  // Clear current contents & any open menus/highlights
  handContainer.innerHTML = '';
  hideActionMenu();

  const hand = Array.isArray(duelState?.players?.[player]?.hand)
    ? duelState.players[player].hand
    : [];

  console.log(`🖐️ Rendering hand for ${player} (${hand.length} cards)`, hand);

  // ✅ Hide opponent's hand unless spectator
  const hideHand = !isSpectator && player === 'player2';

  // Render all cards currently in hand (0..N)
  hand.forEach((entry, index) => {
    // Normalize entry
    const rawId =
      typeof entry === 'object' && entry !== null
        ? (entry.cardId ?? entry.id ?? entry.card_id ?? '000')
        : entry;

    // If we're hiding, force face-down regardless of entry flag
    const isFaceDown =
      hideHand
        ? true
        : (typeof entry === 'object' && entry !== null ? Boolean(entry.isFaceDown) : false);

    const cardIdStr = asIdString(rawId);
    const el = renderCard(cardIdStr, isFaceDown);

    // Debug attrs
    el.dataset.player = player;
    el.dataset.index = String(index);
    el.dataset.cardId = cardIdStr;
    el.dataset.faceDown = String(isFaceDown);

    // Hover highlight
    el.addEventListener('mouseenter', () => el.classList.add('hovering'));
    el.addEventListener('mouseleave', () => el.classList.remove('hovering'));

    // Interactions: only on YOUR (visible) hand in player view
    if (!isSpectator && !hideHand && player === 'player1') {
      el.classList.add('clickable');
      el.title = 'Click to play or discard this card';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        showActionMenuFor(el, player, index);
      });
    } else {
      el.classList.add('spectator');
    }

    handContainer.appendChild(el);
  });

  // Always render/update the discard counter under the hand
  updateDiscardCounter(handContainer, player);
}
