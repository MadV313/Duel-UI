// scripts/chatClient.js
// Robust spectator chat client with local input guards and gentle rate limiting.
// Works with Spectator UI and (optionally) Duel UI if you include a chat panel there.

(function initSpectatorChat() {
  const log   = document.getElementById('chat-log');
  const form  = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const send  = document.getElementById('chat-send');
  const type  = document.getElementById('chat-typing');
  const pres  = document.getElementById('chat-presence');

  // If the page doesn't have chat elements, do nothing.
  if (!log || !form || !input || !send) return;

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

  function sanitizedText() {
    const t = (input.value || '').replace(/\s+/g, ' ').trim();
    return t;
  }

  function canSend() {
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
    return true;
  }

  function disableSend(disabled) {
    try { send.disabled = !!disabled; } catch {}
  }

  async function handleSubmit(ev) {
    if (ev) ev.preventDefault();

    if (!canSend()) return;
    const text = sanitizedText();

    // Local echo (optional). Keep it responsive even if server acks later.
    bubble({ who: name, text, self: true });
    input.value = '';
    setTyping('');
    disableSend(true);
    lastSendAt = now();

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

  // Wire events
  form.addEventListener('submit', handleSubmit);
  send.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Submit with Enter; Shift+Enter for newline (if you later use textarea)
      e.preventDefault();
      handleSubmit(e);
    }
  });
  input.addEventListener('input', () => setTyping(''));

  // Make sure panel is clickable even if a full-screen overlay exists
  try {
    const panel = document.getElementById('chat-panel');
    if (panel) {
      panel.style.pointerEvents = 'auto';
      panel.style.zIndex = '6';
    }
  } catch {}

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
  }

  // Focus input on click inside panel
  document.getElementById('chat-panel')?.addEventListener('click', () => {
    try { input.focus({ preventScroll: true }); } catch {}
  });

  // First paint: keep the send enabled and clear any stale text
  disableSend(false);
  setTyping('');
})();
