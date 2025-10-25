// scripts/chatClient.js
// Robust spectator chat client with local input guards and gentle rate limiting.
// Works with Spectator UI and (optionally) Duel UI if you include a chat panel there.

(function initSpectatorChat() {
  // ✅ Prevent double-wiring if this file is imported twice
  if (window.__CHAT_CLIENT_WIRED__) return;
  window.__CHAT_CLIENT_WIRED__ = true;

  const log   = document.getElementById('chat-log');
  const form  = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send  = document.getElementById('chat-send');
  const type  = document.getElementById('chat-typing');
  const pres  = document.getElementById('chat-presence');

  // If the page doesn't have chat elements, do nothing.
  if (!log || !form || !input || !send) return;

  // Make sure the chat panel can receive clicks even if other overlays exist
  try {
    const panel = document.getElementById('chat-panel');
    if (panel) {
      panel.style.pointerEvents = 'auto';
      panel.style.zIndex = '10005';
    }
    form.style.pointerEvents = 'auto';
    input.style.pointerEvents = 'auto';
    send.style.pointerEvents  = 'auto';
    input.removeAttribute('disabled');
    send.removeAttribute('disabled');
  } catch {}

  // Helpers
  const now = () => Date.now();
  const fmtTime = (d=new Date()) => d.toLocaleTimeString?.([], {hour:'2-digit', minute:'2-digit'}) || '';

  // Identity / routing
  const qs = new URLSearchParams(location.search);
  const name = qs.get('user') || localStorage.getItem('DUEL_PLAYER_NAME') || 'Spectator';
  const api  = (window.API_BASE || qs.get('api') || '/api').replace(/\/+$/,'');
  // Convert /api base → socket origin
  let socketOrigin = location.origin;
  try {
    const u = new URL(api, location.origin);
    socketOrigin = u.origin;
  } catch {}

  // Socket
  let socket = null;
  if (window.io && typeof window.io === 'function') {
    try {
      socket = window.io(socketOrigin, { path: '/socket.io', transports: ['websocket'] });
    } catch (e) {
      console.warn('[chat] socket init failed:', e);
    }
  } else {
    console.warn('[chat] socket.io client not present; chat disabled.');
  }

  // UI helpers
  function scrollToBottom() {
    try { log.scrollTop = log.scrollHeight; } catch {}
  }
  function setTyping(msg) {
    if (!type) return;
    type.textContent = msg || '';
  }
  function setPresence(n) {
    if (!pres) return;
    const count = Number(n) || 0;
    pres.textContent = `${count} online`;
  }
  function bubble({ who, text, ts, self }) {
    const row = document.createElement('div');
    row.className = `chat-row${self ? ' me' : ''}`;
    const card = document.createElement('div');
    card.className = 'chat-bubble';
    card.innerHTML = `
      <div class="chat-meta">
        <span class="chat-name">${who || 'User'}</span>
        <span class="chat-time">${fmtTime(ts ? new Date(ts) : new Date())}</span>
      </div>
      <div class="chat-text"></div>
    `;
    card.querySelector('.chat-text').textContent = text || '';
    row.appendChild(card);
    log.appendChild(row);
    scrollToBottom();
  }

  // Local guards
  let lastSendAt = 0;
  const MIN_SEND_GAP_MS = 1600;

  // Tiny burst limiter to avoid accidental spam (helps prevent 429s)
  let tokens = 2;             // allow a quick double-send at most
  const MAX_TOKENS = 2;
  const REFILL_MS = 1200;
  setInterval(() => { tokens = Math.min(MAX_TOKENS, tokens + 1); }, REFILL_MS);

  function sanitizedText() {
    // Collapse whitespace, limit to 500 chars
    let t = (input.value || '').replace(/\s+/g, ' ').trim();
    if (t.length > 500) t = t.slice(0, 500);
    return t;
  }

  function canSend() {
    // If button is disabled, block
    if (send.disabled) return false;

    const t = sanitizedText();
    if (!t) {
      setTyping('Type a message first.');
      return false;
    }
    const dt = now() - lastSendAt;
    if (dt < MIN_SEND_GAP_MS) {
      setTyping('You’re sending messages too fast.');
      return false;
    }
    if (tokens <= 0) {
      setTyping('Slow down a bit.');
      return false;
    }
    return true;
  }

  function disableSend(disabled) {
    try { send.disabled = !!disabled; } catch {}
  }

  async function handleSubmit(ev) {
    if (ev) ev.preventDefault();

    // Guard empty / throttled sends (prevents server 429s on empty)
    if (!canSend()) return;

    const text = sanitizedText();
    if (!text) return; // double safety

    // Local echo (keeps UI snappy)
    bubble({ who: name, text, self: true });
    input.value = '';
    setTyping('');
    disableSend(true);
    lastSendAt = now();
    tokens = Math.max(0, tokens - 1);

    if (!socket) {
      // No socket? Just re-enable and move on (local echo only).
      disableSend(false);
      return;
    }

    try {
      // Use ack + timeout so we don't get stuck disabled if server is slow.
      let acked = false;
      const timer = setTimeout(() => {
        if (!acked) {
          setTyping('Message may be delayed…');
          disableSend(false);
        }
      }, 3500);

      socket.timeout(4000).emit('chat:send', { text, name }, (err, ok) => {
        acked = true;
        clearTimeout(timer);
        // Server-side validation (e.g., empty or rate-limited)
        if (err || ok === false) {
          setTyping(err?.message || 'Message not accepted.');
        } else {
          setTyping('');
        }
        disableSend(false);
      });
    } catch (e) {
      console.warn('[chat] send error:', e);
      setTyping('Could not send.');
      disableSend(false);
    }
  }

  // Wire events (defensive: remove any legacy inline handler behavior)
  try { form.setAttribute('novalidate', 'novalidate'); } catch {}
  form.addEventListener('submit', handleSubmit);
  send.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Submit with Enter; Shift+Enter would be for textarea (future)
      e.preventDefault();
      handleSubmit(e);
    }
  });
  input.addEventListener('input', () => setTyping(''));

  // Socket listeners (defensive: all optional)
  if (socket) {
    socket.on('connect', () => setTyping(''));
    socket.on('disconnect', () => setTyping('Disconnected.'));

    socket.on('presence', (n) => setPresence(n));
    socket.on('chat:message', (msg) => {
      if (!msg || !msg.text) return;
      const who = msg.name || msg.user || 'User';
      bubble({ who, text: String(msg.text), ts: msg.ts || Date.now(), self: false });
    });

    // If the backend sends a rate-limit notice
    socket.on('chat:rate_limited', (ms) => {
      setTyping(`Slow down a bit${ms ? ` (${Math.ceil(Number(ms)/1000)}s)` : ''}.`);
    });

    // Optional: announce new spectators if server emits it
    socket.on('spectator:joined', (payload) => {
      try {
        const evt = new CustomEvent('spectator:user_joined', { detail: { name: payload?.name || 'Spectator' } });
        window.dispatchEvent(evt);
      } catch {}
    });
  }

  // Focus input on click inside panel (even if overlays are up)
  document.getElementById('chat-panel')?.addEventListener('click', (e) => {
    try {
      // Don’t let outer overlays swallow the focus intent
      e.stopPropagation();
      input.focus({ preventScroll: true });
    } catch {}
  });

  // First paint: keep the send enabled and clear any stale text
  disableSend(false);
  setTyping('');
})();
