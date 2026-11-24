'use strict';

/**
 * LAN Drop — server
 *  - serves the static UI
 *  - runs a tiny WebSocket room so devices can find each other
 *  - relays WebRTC signaling (offer / answer / ICE)
 *  - provides an HTTP relay fallback for browsers without WebRTC
 *    (WebRTC is disabled on plain-http non-localhost origins)
 */

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const TMP = path.join(__dirname, 'tmp');
const RELAY_TTL = 30 * 60 * 1000; // keep relayed files for 30 min max

fs.mkdirSync(TMP, { recursive: true });

const COLORS = [
  '#6ee7b7', '#93c5fd', '#fca5a5', '#fdba74',
  '#c4b5fd', '#67e8f9', '#f9a8d4', '#fde68a',
];

/** @type {Map<string, {id:string,name:string,color:string,ws:import('ws').WebSocket}>} */
const peers = new Map();
/** @type {Map<string, {file:string,name:string,size:number,mime:string,to:string,createdAt:number}>} */
const relays = new Map();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function lanAddress() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  return (
    candidates.find((a) => a.startsWith('192.168.')) ||
    candidates.find((a) => a.startsWith('10.')) ||
    candidates.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ||
    candidates[0] ||
    '127.0.0.1'
  );
}

function colorFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function send(ws, payload) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

function broadcastPeers() {
  const list = [...peers.values()].map((p) => ({ id: p.id, name: p.name, color: p.color }));
  for (const p of peers.values()) send(p.ws, { type: 'peers', peers: list });
}

function cleanName(raw) {
  return String(raw || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
}

function sweepTmp() {
  const cutoff = Date.now() - RELAY_TTL;
  for (const [id, r] of relays) {
    if (r.createdAt < cutoff) {
      fs.rm(r.file, { force: true }, () => {});
      relays.delete(id);
    }
  }
  // orphan files (e.g. aborted uploads) older than the TTL
  fs.readdir(TMP, (err, files) => {
    if (err) return;
    for (const f of files) {
      const full = path.join(TMP, f);
      fs.stat(full, (e, st) => {
        if (!e && st.mtimeMs < Date.now() - RELAY_TTL) fs.rm(full, { force: true }, () => {});
      });
    }
  });
}
setInterval(sweepTmp, 5 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* http routes                                                         */
/* ------------------------------------------------------------------ */

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/info', async (req, res) => {
  const url = `http://${lanAddress()}:${PORT}`;
  let qr = null;
  try {
    qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      color: { dark: '#0b0f14', light: '#e6edf3' },
    });
  } catch {
    /* qr is optional */
  }
  res.json({ url, qr, hostname: os.hostname(), port: PORT });
});

/**
 * Relay fallback: sender POSTs the raw file body, we stream it to disk and
 * tell the recipient over WebSocket that it is ready.
 */
app.post('/api/relay/:to/:id', (req, res) => {
  const { to, id } = req.params;
  const target = peers.get(to);
  if (!target) {
    res.status(404).json({ error: 'That device is no longer online.' });
    return;
  }
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    res.status(400).json({ error: 'Bad transfer id.' });
    return;
  }

  // express has already decoded query values — do not decode twice
  const name = cleanName(String(req.query.name || 'file')) || 'file';
  const mime = String(req.query.mime || 'application/octet-stream').slice(0, 120);
  const from = cleanName(String(req.query.from || ''));
  const file = path.join(TMP, id);
  const out = fs.createWriteStream(file);

  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    size += chunk.length;
  });
  req.on('aborted', () => {
    aborted = true;
    out.destroy();
    fs.rm(file, { force: true }, () => {});
  });
  out.on('error', (err) => {
    fs.rm(file, { force: true }, () => {});
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  out.on('finish', () => {
    if (aborted) return;
    relays.set(id, { file, name, size, mime, to, createdAt: Date.now() });
    send(target.ws, { type: 'relay-incoming', from, transferId: id, name, size, mime });
    res.json({ ok: true, size });
  });

  req.pipe(out);
});

app.get('/api/relay/download/:id', (req, res) => {
  const record = relays.get(req.params.id);
  if (!record) {
    res.status(404).send('This transfer expired or was already downloaded.');
    return;
  }
  res.setHeader('Content-Type', record.mime);
  res.setHeader('Content-Length', record.size);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`
  );
  const stream = fs.createReadStream(record.file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  res.on('close', () => {
    relays.delete(req.params.id);
    fs.rm(record.file, { force: true }, () => {});
  });
});

/* ------------------------------------------------------------------ */
/* websocket room                                                      */
/* ------------------------------------------------------------------ */

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      let id = String(msg.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
      if (!id || peers.has(id)) id = crypto.randomUUID();
      const name = cleanName(msg.name) || 'Device';

      ws.peerId = id;
      peers.set(id, { id, name, color: colorFor(id), ws });

      send(ws, { type: 'welcome', id, name });
      broadcastPeers();
      console.log(`  + ${name} joined (${peers.size} online)`);
      return;
    }

    if (!ws.peerId || !peers.has(ws.peerId)) return;

    if (msg.type === 'rename') {
      const peer = peers.get(ws.peerId);
      const name = cleanName(msg.name);
      if (peer && name) {
        peer.name = name;
        broadcastPeers();
      }
      return;
    }

    if (msg.type === 'signal') {
      const target = peers.get(String(msg.to));
      if (target) send(target.ws, { type: 'signal', from: ws.peerId, data: msg.data });
      return;
    }
  });

  ws.on('close', () => {
    if (ws.peerId && peers.has(ws.peerId)) {
      const peer = peers.get(ws.peerId);
      peers.delete(ws.peerId);
      broadcastPeers();
      console.log(`  - ${peer.name} left (${peers.size} online)`);
    }
  });

  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  LAN Drop is running');
  console.log(`  this machine   http://localhost:${PORT}`);
  console.log(`  on your wi-fi  http://${lanAddress()}:${PORT}`);
  console.log('');
  console.log('  Open that wi-fi address on your phone (or scan the QR in the app).');
  console.log('');
});
