# LAN Drop

AirDrop-style file transfer between the devices on your own Wi-Fi, in a browser.
No app, no account, no cloud — drag a file onto a device and it lands.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000** on this PC and **http://<your-lan-ip>:3000**
on your phone (the address + a QR code are shown in the right-hand panel).

```
  LAN Drop is running
  this machine   http://localhost:3000
  on your wi-fi  http://192.168.0.3:3000
```

## How it works

```
 browser A ──┐                      ┌── browser B
             │   WebSocket (room)   │
             ├──────►  server  ◄────┤      devices find each other here
             │                      │
             └══════ WebRTC ════════┘      actual file bytes (peer-to-peer)
                        │
                        └── fallback: POST -> server -> GET (relay mode)
```

- **Room** — every open page connects to one WebSocket. The server keeps a list
  of names/IDs and broadcasts it. This is the "Nearby" grid.
- **Signaling** — the server forwards SDP offers/answers and ICE candidates.
  It never sees file contents in direct mode.
- **Transfer** — a WebRTC data channel, 64 KB chunks with backpressure handling,
  progress reported as bytes move.
- **Relay fallback** — browsers disable WebRTC on plain `http://` LAN origins
  (it requires a *secure context*: `https://` or `localhost`). Phones opening
  `http://192.168.x.x:3000` therefore cannot use P2P, so the app streams the
  file through the Node server instead. Same feature, slightly less magical.

The badge in the side panel tells you which mode you are in.

## Files

```
server.js          static server + WebSocket room + relay endpoints
public/index.html  markup
public/style.css   styling
public/app.js      discovery, WebRTC, transfer + UI
tmp/               transient relay files (auto-deleted, gitignored)
```

## Good to know

- Only devices on the same LAN can see each other. There is **no authentication** —
  anyone on your network who knows the URL can appear in the list. Don't expose
  this port to the internet.
- Direct mode needs **HTTPS or localhost**. If you want true peer-to-peer from
  your phone, put it behind HTTPS (e.g. `mkcert` + a small https server) or use
  Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
- Received files in direct mode are held in memory until saved, so multi-GB
  transfers are better over relay mode (streamed to disk).
- Relay files live in `tmp/` for at most 30 minutes and are deleted as soon as
  they are downloaded.

## Ideas for v2

- Transfer history and a "recently sent" list
- Multiple files as a single zip-style batch with one progress bar
- Text/clipboard snippets sent the same way
- Cancel button mid-transfer
- Drag a file anywhere on the page → a "pick a device" overlay
- Optional shared PIN so strangers on the network can't join
- resumable transfers (chunk offsets + a manifest)
