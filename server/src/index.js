import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import roomManager from './roomManager.js';

const app = express();
app.use(cors({ origin: '*' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Simple in-memory rate limiting
const ipRequests = new Map();
const RATE_LIMIT_WINDOWMs = 60000;
const MAX_ROOMS_PER_MINUTE = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!ipRequests.has(ip)) {
    ipRequests.set(ip, { count: 1, startTime: now });
    return true;
  }
  const data = ipRequests.get(ip);
  if (now - data.startTime > RATE_LIMIT_WINDOWMs) {
    ipRequests.set(ip, { count: 1, startTime: now });
    return true;
  }
  if (data.count >= MAX_ROOMS_PER_MINUTE) {
    return false;
  }
  data.count++;
  return true;
}

// REST Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: roomManager.rooms.size, uptime: process.uptime() });
});

app.get('/api/room/:roomId', (req, res) => {
  const info = roomManager.getRoomInfo(req.params.roomId);
  if (info) {
    res.json(info);
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Peer connected: ${socket.id}`);

  socket.on('create-room', (fileMetadata, callback) => {
    try {
      const ip = socket.handshake.address;
      if (!checkRateLimit(ip)) {
        return callback({ error: 'Rate limit exceeded. Try again later.' });
      }

      const room = roomManager.createRoom(socket.id, fileMetadata);
      socket.join(room.roomId);
      console.log(`[${new Date().toISOString()}] Room created: ${room.roomId} by ${socket.id}`);
      
      callback({ roomId: room.roomId });
    } catch (err) {
      console.error('Error creating room:', err);
      callback({ error: err.message });
    }
  });

  socket.on('join-room', (roomId, callback) => {
    try {
      const roomInfo = roomManager.joinRoom(roomId, socket.id);
      socket.join(roomId);
      
      // Notify others in room
      socket.to(roomId).emit('peer-joined', { peerId: socket.id });
      console.log(`[${new Date().toISOString()}] Peer ${socket.id} joined room ${roomId}`);
      
      callback({ roomInfo });
    } catch (err) {
      console.error(`Error joining room ${roomId}:`, err.message);
      callback({ error: err.message });
    }
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  socket.on('chunk-map-update', ({ roomId, chunkBitfield }) => {
    roomManager.updatePeerChunkMap(roomId, socket.id, chunkBitfield);
    socket.to(roomId).emit('peer-chunk-map-update', { peerId: socket.id, chunkBitfield });
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        const remaining = roomManager.leaveRoom(roomId, socket.id);
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
        console.log(`[${new Date().toISOString()}] Peer ${socket.id} left room ${roomId}. Remaining peers: ${remaining}`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Peer disconnected: ${socket.id}`);
  });
});

// Stale room cleanup loop
setInterval(() => {
  roomManager.cleanupStaleRooms();
  // Cleanup rate limiting map too
  const now = Date.now();
  for (const [ip, data] of ipRequests.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOWMs) {
      ipRequests.delete(ip);
    }
  }
}, 5 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Signaling server listening on port ${PORT}`);
});
