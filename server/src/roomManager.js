import { v4 as uuidv4 } from 'uuid';

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostSocketId, fileMetadata) {
    const roomId = uuidv4();
    const room = {
      roomId,
      hostId: hostSocketId,
      fileMetadata,
      peers: new Map(), // peerId -> chunkBitfield
      createdAt: Date.now(),
      ttl: 30 * 60 * 1000 // 30 minutes
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.peers.size >= 5) {
      throw new Error('Room is full (max 5 peers)');
    }
    room.peers.set(socketId, new Uint8Array());
    return this.getRoomInfo(roomId);
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    
    if (room.hostId === socketId) {
      // Host left, mark as orphaned
      room.hostId = null;
    } else {
      room.peers.delete(socketId);
    }
    return room.peers.size;
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      fileMetadata: room.fileMetadata,
      peerCount: room.peers.size,
      createdAt: room.createdAt
    };
  }

  getPeersInRoom(roomId, excludeId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const peers = Array.from(room.peers.keys());
    if (room.hostId) peers.push(room.hostId);
    return peers.filter(id => id !== excludeId && id !== null);
  }

  updatePeerChunkMap(roomId, socketId, chunkBitfield) {
    const room = this.rooms.get(roomId);
    if (room && room.peers.has(socketId)) {
      room.peers.set(socketId, chunkBitfield);
    }
  }

  getPeerChunkMaps(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return {};
    return Object.fromEntries(room.peers);
  }

  cleanupStaleRooms() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.createdAt > room.ttl && room.peers.size === 0 && !room.hostId) {
        this.rooms.delete(roomId);
      }
    }
  }
}

export default new RoomManager();
