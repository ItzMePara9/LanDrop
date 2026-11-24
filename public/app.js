'use strict';

/* ================================================================== */
/* helpers                                                             */
/* ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function uuid() {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* insecure context */ }
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function guessName() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux PC';
  return 'Device';
}

/* ================================================================== */
/* state                                                               */
/* ================================================================== */

const stored = (k, fallback) => {
  try { return localStorage.getItem(k) || fallback; } catch { return fallback; }
};
const persist = (k, v) => {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
};

const state = {
  id: stored('landrop.id', '') || uuid(),
  name: stored('landrop.name', '') || guessName(),
  peers: [],
  knownIds: new Set(),
  /** WebRTC data channels are gated behind a secure context (https or localhost). */
  p2p: window.isSecureContext && typeof RTCPeerConnection === 'function',
};

persist('landrop.id', state.id);

const ICE = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ],
};

/* ================================================================== */
/* ui: peers                                                           */
/* ================================================================== */

const peerGrid = $('#peerGrid');
const emptyState = $('#emptyState');
const onlineCount = $('#onlineCount');

function renderPeers() {
  peerGrid.innerHTML = '';
  emptyState.hidden = state.peers.length > 0;
  peerGrid.hidden = state.peers.length === 0;
  onlineCount.textContent = `${state.peers.length} online`;

  for (const peer of state.peers) {
    const card = el('div', 'peer');
    card.tabIndex = 0;
    card.style.setProperty('--c', peer.color || 'var(--accent)');
    card.title = `Send files to ${peer.name}`;

    const avatar = el('div', 'avatar');
    avatar.textContent = (peer.name || '?').trim().charAt(0).toUpperCase();

    const name = el('div', 'pname', peer.name);
    const button = el('button', 'send', 'Send files');
    button.type = 'button';

    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;

    const pick = () => input.click();
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    button.addEventListener('click', (e) => { e.stopPropagation(); pick(); });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      if (files.length) sendFiles(peer, files);
    });

    card.addEventListener('dragover', (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      card.classList.add('drop');
    });
    card.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      card.classList.remove('drop');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) sendFiles(peer, files);
    });

    card.append(avatar, name, button, input);
    peerGrid.append(card);
  }
}

/* ================================================================== */
/* ui: transfers                                                       */
/* ================================================================== */

const transferList = $('#transferList');
const noTransfers = $('#noTransfers');

function addTransfer(direction, peerName, fileName, size) {
  noTransfers.hidden = true;

  const row = el('div', 'transfer');
  const info = el('div', 'tinfo');
  info.append(
    el('div', 'tname', fileName),
    el('div', 'tsub', `${direction === 'out' ? 'To' : 'From'} ${peerName} · ${fmtBytes(size)}`)
  );
  const bar = el('div', 'bar');
  const fill = el('div', 'fill');
  bar.append(fill);
  const stat = el('div', 'tstat', '…');
  row.append(info, bar, stat);
  transferList.prepend(row);

  let settled = false;
  return {
    row,
    progress(fraction) {
      const pct = Math.max(0, Math.min(1, fraction || 0));
      fill.style.width = `${pct * 100}%`;
      stat.textContent = `${Math.round(pct * 100)}%`;
    },
    done(label) {
      if (settled) return;
      settled = true;
      fill.style.width = '100%';
      row.classList.add('ok');
      stat.textContent = label || (direction === 'out' ? 'Sent' : 'Received');
    },
    fail(message) {
      if (settled) return;
      settled = true;
      row.classList.add('err');
      stat.textContent = 'Failed';
      row.title = message || 'Transfer failed';
    },
    /** replace the status cell with something interactive (e.g. a download link) */
    action(node) {
      stat.replaceWith(node);
    },
  };
}

$('#clearDone').addEventListener('click', () => {
  for (const row of [...transferList.children]) {
    if (row.classList.contains('ok') || row.classList.contains('err')) row.remove();
  }
  noTransfers.hidden = transferList.children.length > 0;
});

/* ================================================================== */
/* toasts                                                              */
/* ================================================================== */

function toast(message, kind) {
  const node = el('div', `toast${kind === 'err' ? ' err' : ''}`, message);
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 260);
  }, 3800);
}

/* ================================================================== */
/* websocket room                                                      */
/* ================================================================== */

let ws = null;
let reconnectTimer = null;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', id: state.id, name: state.name }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleMessage(msg);
  };

  ws.onclose = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1200);
  };

  ws.onerror = () => { /* onclose handles it */ };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      if (msg.id && msg.id !== state.id) {
        state.id = msg.id;
        persist('landrop.id', state.id);
      }
      break;
    }

    case 'peers': {
      const list = Array.isArray(msg.peers) ? msg.peers : [];
      state.peers = list.filter((p) => p.id !== state.id);

      for (const peer of state.peers) {
        if (!state.knownIds.has(peer.id)) {
          state.knownIds.add(peer.id);
          toast(`${peer.name} is nearby`);
        }
      }
      for (const known of [...state.knownIds]) {
        if (!state.peers.some((p) => p.id === known)) {
          state.knownIds.delete(known);
          const gone = list.find((p) => p.id === known);
          if (gone) toast(`${gone.name} left`);
        }
      }

      renderPeers();
      break;
    }

    case 'signal': {
      onSignal(msg.from, msg.data).catch((err) => console.warn('signal error', err));
      break;
    }

    case 'relay-incoming': {
      onRelayIncoming(msg);
      break;
    }
  }
}

function peerName(id) {
  return state.peers.find((p) => p.id === id)?.name || 'Device';
}

/* ================================================================== */
/* sending                                                             */
/* ================================================================== */

async function sendFiles(peer, files) {
  for (const file of files) {
    if (file.size === 0) {
      toast(`“${file.name}” is empty, skipped`, 'err');
      continue;
    }
    await enqueue(peer.id, () => sendOne(peer, file));
  }
}

/**
 * One active WebRTC connection per peer at a time. Dropping two files at once
 * (or double-dropping) would otherwise clobber the offer/answer handshake.
 */
const sendQueues = new Map();
function enqueue(key, task) {
  const prev = sendQueues.get(key) || Promise.resolve();
  const next = prev.then(task, task);
  sendQueues.set(key, next.catch(() => {}));
  return next;
}

/** peerId -> RTCPeerConnection for transfers we are sending */
const outbound = new Map();

async function sendOne(peer, file) {
  const t = addTransfer('out', peer.name, file.name, file.size);

  if (state.p2p) {
    try {
      await sendDirect(peer, file, t);
      t.done();
      return;
    } catch (err) {
      console.warn('direct transfer failed, falling back to relay:', err);
    }
  }

  try {
    await sendRelay(peer, file, t);
    t.done();
  } catch (err) {
    t.fail(err.message);
    toast(`Couldn't send “${file.name}”: ${err.message}`, 'err');
  }
}

/* ---- direct (WebRTC data channel) ---- */

function drain(dc) {
  return new Promise((resolve) => {
    const done = () => {
      dc.removeEventListener('bufferedamountlow', done);
      resolve();
    };
    dc.addEventListener('bufferedamountlow', done);
    setTimeout(done, 600);
  });
}

function sendDirect(peer, file, t) {
  return new Promise((resolve, reject) => {
    const pc = new RTCPeerConnection(ICE);
    outbound.set(peer.id, pc);

    const dc = pc.createDataChannel('file', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 512 * 1024;

    let settled = false;
    let localCandidates = 0;
    let ackResolve = () => {};
    const ack = new Promise((r) => { ackResolve = r; });

    const timer = setTimeout(() => end(new Error('Timed out')), 12000);

    function end(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outbound.get(peer.id) === pc) outbound.delete(peer.id);
      try { dc.close(); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
      err ? reject(err) : resolve();
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        // gathering finished with nothing to offer: this network/browser can't do P2P
        if (localCandidates === 0) end(new Error('No direct route available'));
        return;
      }
      localCandidates++;
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'signal', to: peer.id, data: { candidate: e.candidate } }));
      }
    };
    pc.onconnectionstatechange = () => {
      // "disconnected" is often transient; let the timeout handle it
      if (pc.connectionState === 'failed') end(new Error('Connection failed'));
    };

    dc.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try { if (JSON.parse(e.data).t === 'ack') ackResolve(); } catch { /* ignore */ }
    };
    dc.onclose = () => end(new Error('Channel closed'));

    dc.onopen = async () => {
      try {
        dc.send(JSON.stringify({
          t: 'meta',
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
        }));

        const CHUNK = 64 * 1024;
        let offset = 0;
        while (offset < file.size) {
          if (dc.bufferedAmount > 4 * 1024 * 1024) await drain(dc);
          if (dc.readyState !== 'open') throw new Error('Channel closed');
          const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
          dc.send(buf);
          offset += buf.byteLength;
          t.progress(offset / file.size);
        }

        // wait for the receiver to confirm it has the whole file
        await Promise.race([ack, new Promise((r) => setTimeout(r, 4000))]);
        end();
      } catch (err) {
        end(err);
      }
    };

    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'signal', to: peer.id, data: { sdp: pc.localDescription } }));
      } catch (err) {
        end(err);
      }
    })();
  });
}

/* ---- relay (through the server) ---- */

function sendRelay(peer, file, t) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const xhr = new XMLHttpRequest();
    const url =
      `/api/relay/${encodeURIComponent(peer.id)}/${encodeURIComponent(id)}` +
      `?name=${encodeURIComponent(file.name)}` +
      `&mime=${encodeURIComponent(file.type || 'application/octet-stream')}` +
      `&from=${encodeURIComponent(state.id)}`;

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) t.progress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let detail = `server responded ${xhr.status}`;
        try { detail = JSON.parse(xhr.responseText).error || detail; } catch { /* ignore */ }
        reject(new Error(detail));
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.onabort = () => reject(new Error('upload cancelled'));
    xhr.send(file);
  });
}

/* ================================================================== */
/* receiving                                                           */
/* ================================================================== */

/** fromId -> { pc, meta, chunks, received, transfer } */
const inbound = new Map();
/** fromId -> queued ICE candidates that arrived before the offer */
const pendingIce = new Map();

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = name || 'file';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function onSignal(from, data) {
  if (!data) return;

  if (data.sdp && data.sdp.type === 'offer') {
    const pc = new RTCPeerConnection(ICE);
    const entry = { pc, meta: null, chunks: [], received: 0, transfer: null, from };
    inbound.set(from, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate && ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'signal', to: from, data: { candidate: e.candidate } }));
      }
    };
    pc.ondatachannel = (e) => setupInboundChannel(entry, e.channel);

    await pc.setRemoteDescription(data.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'signal', to: from, data: { sdp: pc.localDescription } }));

    const queued = pendingIce.get(from);
    if (queued) {
      pendingIce.delete(from);
      for (const candidate of queued) {
        try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
      }
    }
    return;
  }

  if (data.sdp && data.sdp.type === 'answer') {
    const pc = outbound.get(from);
    if (pc) {
      try { await pc.setRemoteDescription(data.sdp); } catch (err) { console.warn('answer', err); }
    }
    return;
  }

  if (data.candidate) {
    const outgoing = outbound.get(from);
    if (outgoing) {
      try { await outgoing.addIceCandidate(data.candidate); } catch { /* ignore */ }
      return;
    }
    const entry = inbound.get(from);
    if (entry) {
      try { await entry.pc.addIceCandidate(data.candidate); } catch { /* ignore */ }
    } else {
      const queue = pendingIce.get(from) || [];
      queue.push(data.candidate);
      pendingIce.set(from, queue);
    }
  }
}

function setupInboundChannel(entry, dc) {
  dc.binaryType = 'arraybuffer';

  dc.onmessage = (event) => {
    if (typeof event.data === 'string') {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.t === 'meta') {
        entry.meta = msg;
        entry.transfer = addTransfer('in', peerName(entry.from), msg.name, msg.size);
      }
      return;
    }

    if (!entry.meta) return;
    entry.chunks.push(event.data);
    entry.received += event.data.byteLength;
    entry.transfer?.progress(entry.received / entry.meta.size);

    if (entry.received >= entry.meta.size) {
      const blob = new Blob(entry.chunks, { type: entry.meta.mime });
      entry.transfer?.done('Received');
      saveBlob(blob, entry.meta.name);
      try { dc.send(JSON.stringify({ t: 'ack' })); } catch { /* ignore */ }
      entry.chunks = [];
      setTimeout(() => {
        try { dc.close(); entry.pc.close(); } catch { /* ignore */ }
        inbound.delete(entry.from);
      }, 1200);
    }
  };

  dc.onclose = () => {
    if (entry.received < (entry.meta?.size ?? 0)) {
      entry.transfer?.fail('Connection closed before the file finished');
    }
  };
}

function onRelayIncoming(msg) {
  const t = addTransfer('in', peerName(msg.from), msg.name, msg.size);
  t.progress(1);

  const link = el('a', 'dl', 'Download');
  link.href = `/api/relay/download/${encodeURIComponent(msg.transferId)}`;
  link.setAttribute('download', msg.name);
  link.addEventListener('click', () => t.done('Ready'));
  t.action(link);

  toast(`${peerName(msg.from)} sent ${msg.name}`);
}

/* ================================================================== */
/* misc wiring                                                         */
/* ================================================================== */

const nameInput = $('#myName');
nameInput.value = state.name;
nameInput.addEventListener('change', () => {
  const next = nameInput.value.trim().slice(0, 40) || guessName();
  state.name = next;
  nameInput.value = next;
  persist('landrop.name', next);
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'rename', name: next }));
});

const badge = $('#modeBadge');
if (state.p2p) {
  badge.textContent = 'direct · peer-to-peer';
  badge.classList.add('direct');
} else {
  badge.textContent = 'relay mode · via this PC';
  badge.classList.add('relay');
  badge.title =
    'WebRTC needs HTTPS or localhost. On a plain http:// LAN address files are relayed through the server instead.';
}

// stop the browser from navigating away when a file is dropped outside a card
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// keep the page alive-ish when backgrounded
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ws?.readyState !== 1) connect();
});

/* ================================================================== */
/* boot                                                                */
/* ================================================================== */

fetch('/api/info')
  .then((r) => r.json())
  .then((info) => {
    if (info.qr) $('#qr').src = info.qr;
    if (info.url) $('#joinUrl').textContent = info.url;
  })
  .catch(() => {
    $('#joinUrl').textContent = location.origin;
  });

connect();
