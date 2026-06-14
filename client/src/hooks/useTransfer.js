import { useState, useRef, useCallback, useEffect } from 'react';
import PeerMesh from '../engine/PeerMesh';
import FileChunker from '../engine/FileChunker';
import FileAssembler from '../engine/FileAssembler';
import CryptoEngine from '../engine/CryptoEngine';
import StorageManager from '../engine/StorageManager';
import TransferStats from '../engine/TransferStats';

const LOG = (...args) => console.log('[useTransfer]', ...args);
const ERR = (...args) => console.error('[useTransfer]', ...args);

export function useTransfer() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('');
  const [eta, setEta] = useState('');
  const [bytesTransferred, setBytesTransferred] = useState('0 B');
  const [totalBytes, setTotalBytes] = useState('0 B');
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [fileName, setFileName] = useState(null);

  const engineRef = useRef({
    mesh: null, chunker: null, assembler: null,
    cryptoKey: null, storage: null, stats: null, file: null, role: null,
    started: false, socketListeners: []
  });

  // Cleanup socket listeners on unmount
  useEffect(() => {
    return () => {
      LOG('Cleanup: removing socket listeners and closing mesh');
      const eng = engineRef.current;
      for (const { socket, event, handler } of eng.socketListeners) {
        socket.off(event, handler);
      }
      eng.socketListeners = [];
      if (eng.mesh) {
        eng.mesh.close();
        eng.mesh = null;
      }
      eng.started = false;
    };
  }, []);

  // Helper to register a socket listener that will be cleaned up on unmount
  const addSocketListener = (socket, event, handler) => {
    socket.on(event, handler);
    engineRef.current.socketListeners.push({ socket, event, handler });
  };

  const updateStats = () => {
    if (engineRef.current.stats) {
      const s = engineRef.current.stats.getStats();
      setProgress(s.progress);
      setSpeed(TransferStats.formatSpeed(s.speed));
      setEta(TransferStats.formatTime(s.eta));
      setBytesTransferred(TransferStats.formatBytes(s.bytesTransferred));
    }
  };

  const startSending = useCallback(async (file, roomId, socket) => {
    if (!socket || engineRef.current.started) {
      LOG('startSending: skipped (socket=%s, started=%s)', !!socket, engineRef.current.started);
      return;
    }
    engineRef.current.started = true;
    LOG('startSending: BEGIN for file=%s size=%d room=%s', file.name, file.size, roomId);

    try {
      setStatus('waiting');

      // Generate encryption key
      const { key, keyString } = await CryptoEngine.generateKey();
      LOG('startSending: encryption key generated');
      setEncryptionKey(keyString);
      engineRef.current.cryptoKey = key;
      engineRef.current.file = file;
      engineRef.current.role = 'sender';

      // Create mesh
      const mesh = new PeerMesh(socket, roomId, socket.id);
      engineRef.current.mesh = mesh;
      LOG('startSending: PeerMesh created, localPeerId=%s', socket.id);

      // Generate manifest (reads file + computes SHA-256)
      const chunker = new FileChunker(file);
      engineRef.current.chunker = chunker;
      LOG('startSending: generating manifest (hashing file)...');
      const manifest = await chunker.generateManifest();
      LOG('startSending: manifest ready — chunks=%d hash=%s', manifest.totalChunks, manifest.fileHash.slice(0, 16) + '...');

      engineRef.current.stats = new TransferStats(manifest.fileSize);
      setTotalBytes(TransferStats.formatBytes(manifest.fileSize));

      // When a peer's DataChannels open, send manifest
      mesh.addEventListener('peer-connected', async (e) => {
        const peerId = e.detail.peerId;
        LOG('peer-connected: %s — sending manifest', peerId);
        setStatus('transferring');
        setPeers(mesh.getConnectedPeers().map(id => ({ id, status: 'connected' })));

        // Send manifest over control channel
        mesh.sendControlTo(peerId, { type: 'manifest', manifest });
        LOG('peer-connected: manifest sent to %s, waiting for ACK', peerId);
      });

      mesh.addEventListener('control-received', async (e) => {
        const peerId = e.detail.peerId;
        const msg = e.detail.message;
        
        if (msg.type === 'manifest-ack') {
          LOG('sender: received manifest-ack from %s. Starting chunk transfer.', peerId);
          
          // Send all chunks
          if (manifest.totalChunks === 0) {
            LOG('sender: 0-byte file detected — transfer complete immediately');
            setStatus('complete');
          } else {
            for (let i = 0; i < manifest.totalChunks; i++) {
              const chunk = await chunker.getChunk(i);
              const encrypted = await CryptoEngine.encryptChunk(engineRef.current.cryptoKey, chunk.data);

              // Prepend 4-byte little-endian chunk index to the encrypted payload
              const payload = new Uint8Array(4 + encrypted.byteLength);
              new DataView(payload.buffer).setUint32(0, i, true);
              payload.set(new Uint8Array(encrypted), 4);

              await mesh.sendChunkTo(peerId, payload.buffer);

              engineRef.current.stats.recordBytes(chunk.data.byteLength);
              updateStats();

              if (i % 50 === 0) {
                LOG('sender: chunk %d/%d sent', i, manifest.totalChunks);
              }
            }
            
            LOG('sender: all %d chunks sent to buffer — waiting for network drain', manifest.totalChunks);
            setStatus('waiting-ack');
            await mesh.awaitDrainTo(peerId);
            LOG('sender: network drain complete');
            setStatus('complete');
          }
        }
      });

      mesh.addEventListener('peer-disconnected', (e) => {
        LOG('peer-disconnected: %s', e.detail.peerId);
        setPeers(mesh.getConnectedPeers().map(id => ({ id, status: 'connected' })));
        if (status === 'transferring' || status === 'waiting-ack') {
          setStatus('error');
          setError('Peer disconnected. Transfer aborted.');
        }
      });

      // Handle incoming signaling messages (answers + ICE candidates from receiver)
      const signalHandler = async ({ from, signal }) => {
        LOG('sender signal received: from=%s type=%s', from, signal.type);
        try {
          // Get or create peer (returns existing if already known)
          const peer = mesh.addPeer(from, false);
          if (signal.type === 'offer') {
            await peer.handleOffer(signal.data);
          } else if (signal.type === 'answer') {
            await peer.handleAnswer(signal.data);
          } else if (signal.type === 'ice-candidate') {
            peer.handleIceCandidate(signal.data);
          }
        } catch (err) {
          ERR('sender signal handler error:', err);
        }
      };
      addSocketListener(socket, 'signal', signalHandler);

      // When a new peer joins, initiate the WebRTC handshake
      const peerJoinedHandler = async ({ peerId }) => {
        LOG('peer-joined: %s — creating offer as initiator', peerId);
        try {
          const peer = mesh.addPeer(peerId, true);
          await peer.createOffer();
          LOG('peer-joined: offer sent to %s', peerId);
        } catch (err) {
          ERR('peer-joined: createOffer failed:', err);
          setError('Failed to create WebRTC offer: ' + err.message);
        }
      };
      addSocketListener(socket, 'peer-joined', peerJoinedHandler);

    } catch (err) {
      ERR('startSending FAILED:', err);
      setError(err.message);
    }
  }, []);

  const startReceiving = useCallback(async (roomId, socket, keyString) => {
    if (!socket || engineRef.current.started) {
      LOG('startReceiving: skipped (socket=%s, started=%s)', !!socket, engineRef.current.started);
      return;
    }
    engineRef.current.started = true;
    LOG('startReceiving: BEGIN room=%s', roomId);

    try {
      setStatus('connecting');

      // Import encryption key from URL fragment
      const cryptoKey = await CryptoEngine.importKey(keyString);
      LOG('startReceiving: encryption key imported');
      engineRef.current.cryptoKey = cryptoKey;
      engineRef.current.role = 'receiver';

      // Create mesh
      const mesh = new PeerMesh(socket, roomId, socket.id);
      engineRef.current.mesh = mesh;
      LOG('startReceiving: PeerMesh created, localPeerId=%s', socket.id);

      // Track when DataChannels open
      mesh.addEventListener('peer-connected', (e) => {
        LOG('receiver peer-connected: %s', e.detail.peerId);
        setPeers(mesh.getConnectedPeers().map(id => ({ id, status: 'connected' })));
      });

      mesh.addEventListener('peer-disconnected', (e) => {
        LOG('receiver peer-disconnected: %s', e.detail.peerId);
        setPeers(mesh.getConnectedPeers().map(id => ({ id, status: 'connected' })));
        if (status === 'transferring' || status === 'connecting') {
          setStatus('error');
          setError('Peer disconnected. Transfer aborted.');
        }
      });

      // Handle control messages (manifest)
      mesh.addEventListener('control-received', async (e) => {
        const msg = e.detail.message;
        LOG('receiver control-received: type=%s', msg.type);

        if (msg.type === 'manifest') {
          const manifest = msg.manifest;
          LOG('receiver: manifest received — file=%s size=%d chunks=%d',
            manifest.fileName, manifest.fileSize, manifest.totalChunks);

          setStatus('transferring');
          setFileName(manifest.fileName);

          const storage = new StorageManager(manifest.fileName);
          await storage.init();
          engineRef.current.storage = storage;

          const assembler = new FileAssembler(manifest);
          engineRef.current.assembler = assembler;

          engineRef.current.stats = new TransferStats(manifest.fileSize);
          setTotalBytes(TransferStats.formatBytes(manifest.fileSize));

          // Send ACK to sender so it starts sending chunks
          mesh.sendControlTo(e.detail.peerId, { type: 'manifest-ack' });
          LOG('receiver: manifest processed, sent manifest-ack');

          if (manifest.totalChunks === 0 && !engineRef.current.assembling) {
            engineRef.current.assembling = true;
            LOG('receiver: 0-byte file — assembling immediately');
            setStatus('complete');
            try {
              const blob = await assembler.assemble();
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);
              setFileName(manifest.fileName);
            } catch (err) {
              ERR('receiver: assembly error for 0-byte file:', err);
              setError('Assembly error: ' + err.message);
            }
          }
        }
      });

      // Handle incoming file chunks
      mesh.addEventListener('chunk-received', async (e) => {
        const data = e.detail.data;
        const index = new DataView(data).getUint32(0, true);
        const encrypted = data.slice(4);

        try {
          const decrypted = await CryptoEngine.decryptChunk(engineRef.current.cryptoKey, encrypted);

          const { assembler, storage, stats } = engineRef.current;
          if (!assembler || !storage) {
            ERR('receiver: chunk %d arrived before manifest was processed, dropping', index);
            return;
          }

          // Verify hash and store chunk
          const expectedHash = assembler.manifest.chunkHashes ? assembler.manifest.chunkHashes[index] : null;
          await assembler.receiveChunk(index, decrypted, expectedHash);

          // We bypass StorageManager here because it causes massive IndexedDB concurrency deadlocks
          // when receiving 1000s of chunks per second, and FileAssembler already holds chunks in RAM.
          
          stats.recordBytes(decrypted.byteLength);
          updateStats();

          if (index % 50 === 0) {
            LOG('receiver: chunk %d/%d received', index, assembler.manifest.totalChunks);
          }

          if (assembler.isComplete() && !engineRef.current.assembling) {
            engineRef.current.assembling = true;
            LOG('receiver: all chunks received — assembling file');
            setStatus('complete');
            
            try {
              const blob = await assembler.assemble();
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);
              setFileName(assembler.manifest.fileName);
              LOG('receiver: file assembled successfully, triggering auto-download');
              assembler.triggerDownload(blob);
            } catch (assemblyErr) {
              ERR('receiver: assembly failed:', assemblyErr);
              setError('Assembly error: ' + assemblyErr.message);
            }
          }
        } catch (err) {
          ERR('receiver: chunk %d processing error:', index, err);
          setError('Processing error: ' + err.message);
        }
      });

      // Handle incoming signaling messages (offers + ICE candidates from sender)
      const signalHandler = async ({ from, signal }) => {
        LOG('receiver signal received: from=%s type=%s', from, signal.type);
        try {
          const peer = mesh.addPeer(from, false);
          if (signal.type === 'offer') {
            await peer.handleOffer(signal.data);
          } else if (signal.type === 'answer') {
            await peer.handleAnswer(signal.data);
          } else if (signal.type === 'ice-candidate') {
            peer.handleIceCandidate(signal.data);
          }
        } catch (err) {
          ERR('receiver signal handler error:', err);
        }
      };
      addSocketListener(socket, 'signal', signalHandler);

      // Join the room — this triggers 'peer-joined' on the sender side
      LOG('startReceiving: emitting join-room for %s', roomId);
      socket.emit('join-room', roomId, (response) => {
        if (response.error) {
          ERR('startReceiving: join-room failed:', response.error);
          setError(response.error);
        } else {
          LOG('startReceiving: joined room successfully, roomInfo=%o', response.roomInfo);
        }
      });

    } catch (err) {
      ERR('startReceiving FAILED:', err);
      setError(err.message);
    }
  }, []);

  return {
    status, progress, speed, eta, bytesTransferred, totalBytes, peers, error,
    startSending, startReceiving, encryptionKey, downloadUrl, fileName
  };
}
