# P2P Web Share

A direct, peer-to-peer file sharing application built with React, WebRTC, and Node.js. 
This project was built for MARS OpenProjects 2026.

## Core Features
* **Direct P2P Transfer**: Files are transferred directly between peers via WebRTC Data Channels. The data never touches a central server.
* **Zero-Knowledge Encryption**: Files are encrypted chunk-by-chunk using the Web Crypto API (AES-GCM). The decryption key is generated locally and shared via the URL hash (`#key=...`), meaning the signaling server has absolutely zero knowledge of the data.
* **Chunk-Level Hash Verification**: SHA-256 hashes are generated for every individual file chunk. The receiver verifies each chunk upon receipt to guarantee zero data corruption.
* **Minimal Drag-and-Drop UI**: An intuitive drag-and-drop zone to start sharing instantly.
* **Real-time Status Indicators**: Live transfer speed, progress percentage, ETA, and connected peers.
* **Auto-Download**: Seamlessly reassembles verified chunks in RAM and triggers the browser download automatically.
* **Graceful Disconnects**: UI reliably alerts users if a peer drops mid-transfer.

## Tech Stack
* **Frontend**: React.js, Vite
* **Backend Signaling**: Node.js, Express, Socket.io
* **P2P Communication**: Raw WebRTC API (RTCPeerConnection, RTCDataChannel)

## Setup Instructions

### 1. Start the Signaling Server
```bash
cd server
npm install
npm run dev
```
The server will start on port `3001`.

### 2. Start the React Frontend
```bash
cd client
npm install
npm run dev
```
The Vite development server will start. Open the provided `localhost` URL in your browser.

## Architecture

1. **Signaling**: The sender drags a file into the app. The app creates an ephemeral "Room" on the Socket.io backend and generates an encryption key.
2. **Handshake**: The receiver opens the share link. The sender and receiver exchange WebRTC SDP offers and ICE candidates through the Socket.io signaling server.
3. **Transmission**: The sender reads the file via the HTML5 FileReader API in 16KB chunks. Each chunk is encrypted (AES-GCM) and sent over a binary WebRTC Data Channel. A secondary JSON control channel handles manifests and ACKs.
4. **Assembly**: The receiver decrypts the chunks, verifies their SHA-256 hashes against the manifest, and reassembles them in memory using a `Blob` before triggering a local download.
