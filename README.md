 <div align="center">

# ⚡ LAN Drop

### Fast. Simple. Local.

**AirDrop-style file sharing directly from your browser.**

Transfer files between computers, smartphones, and other devices connected to the same Wi-Fi network — without installing apps, creating accounts, or uploading to the cloud.

**Drag. Drop. Transfer.**

![Version](https://img.shields.io/badge/Version-1.0.0-6366f1?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-Powered-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-Peer--to--Peer-4285F4?style=for-the-badge&logo=webrtc&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

</div>

---

## 🚀 Overview

**LAN Drop** is a lightweight, self-hosted file-sharing application that makes transferring files across your local network effortless.

Inspired by Apple's AirDrop, LAN Drop automatically discovers nearby connected devices and lets you send files directly from your browser.

No complicated setup. No third-party storage. Just fast and convenient local file sharing.

## ✨ Features

- 📡 **Automatic Device Discovery** — Find devices connected to LAN Drop on your local network.
- ⚡ **Fast File Transfers** — Transfer files using WebRTC or automatic server relay.
- 🖱️ **Drag & Drop** — Simply drag files onto a nearby device to send them.
- 📱 **Cross-Platform** — Works across Windows, Linux, macOS, Android, and iOS using compatible browsers.
- 🔗 **QR Code Connection** — Connect smartphones by scanning the displayed QR code.
- 🔒 **Local File Sharing** — No cloud uploads or external file-hosting services.
- 📊 **Live Transfer Progress** — Monitor file transfer progress in real time.
- 🔄 **Automatic Fallback** — Switches to server relay when direct peer-to-peer transfers aren't available.
- 🌐 **Browser-Based** — No additional client applications required.

## 📦 Installation

### Prerequisites

Before installing LAN Drop, make sure you have:

- Node.js and npm installed.
- A computer to host the application.
- Devices connected to the same Wi-Fi or local network.
- A modern web browser.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/ItzMePara9/LAN-Drop.git
cd LAN-Drop
```

**Note:** Replace the repository URL if your actual GitHub repository uses a different name.

### Step 2 — Install Dependencies

```bash
npm install
```

### Step 3 — Start LAN Drop

```bash
npm start
```

### Step 4 — Open the Application

On your computer, open:

```text
http://localhost:3000
```

For other devices connected to the same Wi-Fi, open the LAN address displayed in your terminal.

Example:

```text
http://192.168.0.3:3000
```

You can also scan the QR code displayed inside the application to connect from your phone.

**🎉 You're ready to start sharing files!**

## 📲 How to Use

1. Start LAN Drop on your computer.
2. Open the LAN Drop URL on another device connected to the same network.
3. Wait for connected devices to appear in the **Nearby Devices** section.
4. Drag and drop a file onto the device you want to send it to.
5. Monitor the transfer progress and save the received file.

## ⚙️ How It Works

LAN Drop uses **WebSocket, WebRTC, and Node.js** to provide local device discovery and file transfers.

| Technology | Purpose |
|---|---|
| Node.js | Hosts the application and handles relay transfers |
| WebSocket | Discovers connected devices and exchanges signaling messages |
| WebRTC | Transfers files directly between supported peers |
| JavaScript | Handles device discovery, transfers, and browser interactions |
| HTML & CSS | Provides the responsive user interface |

### 🔁 Transfer Modes

**⚡ Direct Mode (WebRTC)**

Files transfer directly between connected devices without passing through the Node.js server.

- Peer-to-peer file transfers.
- 64 KB data chunks with backpressure handling.
- Real-time progress tracking.
- Requires a secure browser context, such as HTTPS or localhost.

**🌐 Relay Mode (Fallback)**

When direct WebRTC connections are unavailable, LAN Drop automatically routes transfers through the local Node.js server.

- Works with ordinary HTTP connections on local networks.
- Streams files through the server.
- Temporarily stores transferred files on disk.
- Automatically cleans up temporary files.

The application displays the active transfer mode in its interface.

## 📁 Project Structure

```text
LAN-Drop/
├── public/
│   ├── index.html       # Application interface
│   ├── style.css        # UI styling
│   └── app.js           # Discovery and file transfer logic
├── tmp/                 # Temporary relay storage
├── server.js            # Node.js and WebSocket server
├── package.json         # Project dependencies and scripts
└── README.md            # Documentation
```

## 🔐 Security & Privacy

LAN Drop is designed for trusted local networks.

- ✅ No accounts or cloud storage required.
- ✅ Direct transfers do not pass file contents through the application server.
- ✅ Relay files are automatically deleted after downloading or within 30 minutes.
- ✅ Temporary relay files are excluded from Git.
- ⚠️ No built-in authentication is currently provided.
- ⚠️ Anyone with access to your network and the application URL may connect.
- ⚠️ Never expose the LAN Drop server directly to the public internet without additional security.

**Important:** WebRTC direct mode requires a secure browser context. Devices connecting through a normal LAN HTTP address may use relay mode instead.

## 🛣️ Future Roadmap

- [ ] 📜 Transfer history
- [ ] 📦 Multiple-file transfers
- [ ] 📋 Clipboard and text sharing
- [ ] ⏸️ Cancel and resume transfers
- [ ] 🔐 Optional PIN-based authentication
- [ ] 🖱️ Full-page drag-and-drop support
- [ ] 🔄 Resumable large-file transfers

## 👨‍💻 Credits

**Developed by [ItzMePara9](https://github.com/ItzMePara9)**

Built to make local file sharing simple, accessible, and efficient.

---

<div align="center">

### ⚡ LAN Drop

**Your files. Your network. Your control.**

Made with ❤️ by **[ItzMePara9](https://github.com/ItzMePara9)**

⭐ Star the repository if you find this project useful!

</div>
