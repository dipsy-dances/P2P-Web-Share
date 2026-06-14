import WebRTCManager from './WebRTCManager.js';

export default class PeerMesh extends EventTarget {
  constructor(socket, roomId, localPeerId) {
    super();
    this.socket = socket;
    this.roomId = roomId;
    this.localPeerId = localPeerId;
    this.peers = new Map();
  }

  addPeer(peerId, isInitiator, config = {}) {
    if (this.peers.has(peerId)) return this.peers.get(peerId);

    const peer = new WebRTCManager(this.socket, peerId, isInitiator, config);
    
    peer.addEventListener('connected', () => {
      this.dispatchEvent(new CustomEvent('peer-connected', { detail: { peerId } }));
    });

    peer.addEventListener('disconnected', () => {
      this.removePeer(peerId);
      this.dispatchEvent(new CustomEvent('peer-disconnected', { detail: { peerId } }));
    });

    peer.addEventListener('data', (e) => {
      this.dispatchEvent(new CustomEvent('chunk-received', { detail: { peerId, data: e.detail } }));
    });

    peer.addEventListener('control', (e) => {
      this.dispatchEvent(new CustomEvent('control-received', { detail: { peerId, message: e.detail } }));
    });

    this.peers.set(peerId, peer);
    return peer;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
  }

  broadcastControl(message) {
    for (const peer of this.peers.values()) {
      peer.sendControl(message);
    }
  }

  sendControlTo(peerId, message) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.sendControl(message);
    }
  }

  async sendChunkTo(peerId, chunkData) {
    const peer = this.peers.get(peerId);
    if (peer) {
      await peer.sendChunk(chunkData);
    }
  }

  async awaitDrainTo(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      await peer.awaitDrain();
    }
  }

  getConnectedPeers() {
    return Array.from(this.peers.keys());
  }

  getChunkStrategy(myChunks, peerChunkMaps, totalChunks) {
    const chunkCounts = new Array(totalChunks).fill(0);
    const peerAvailabilities = new Map(); 

    for (let i = 0; i < totalChunks; i++) {
      peerAvailabilities.set(i, []);
    }

    for (const [peerId, bitfield] of Object.entries(peerChunkMaps)) {
      const buffer = new Uint8Array(bitfield);
      for (let i = 0; i < totalChunks; i++) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        if (buffer.length > byteIndex && (buffer[byteIndex] & (1 << bitIndex))) {
          chunkCounts[i]++;
          peerAvailabilities.get(i).push(peerId);
        }
      }
    }

    const strategy = new Map();
    const neededChunks = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!myChunks.has(i) && chunkCounts[i] > 0) {
        neededChunks.push({ index: i, count: chunkCounts[i] });
      }
    }

    neededChunks.sort((a, b) => a.count - b.count);

    for (const chunk of neededChunks) {
      const peersHaveIt = peerAvailabilities.get(chunk.index);
      const pickedPeer = peersHaveIt[Math.floor(Math.random() * peersHaveIt.length)];
      strategy.set(chunk.index, pickedPeer);
    }

    return strategy;
  }

  close() {
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
  }
}
