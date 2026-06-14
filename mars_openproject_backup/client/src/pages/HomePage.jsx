import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useRoom } from '../hooks/useRoom';
import { useTransfer } from '../hooks/useTransfer';

export default function HomePage() {
  const [file, setFile] = useState(null);
  const { socket, isConnected, socketId } = useSocket();
  const { createRoom, roomId, roomInfo, error: roomError } = useRoom();
  const { status, progress, speed, eta, bytesTransferred, totalBytes, startSending, encryptionKey, error: transferError } = useTransfer();

  const handleCreateRoom = () => {
    if (!file) return alert('Select a file first');
    createRoom({ name: file.name, size: file.size, type: file.type });
  };

  useEffect(() => {
    if (roomId && socket && file && status === 'idle') {
      startSending(file, roomId, socket);
    }
  }, [roomId, socket, file, status, startSending]);

  const shareUrl = roomId && encryptionKey ? `${window.location.origin}/room/${roomId}#key=${encryptionKey}` : '';

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Sender Node</h1>
      <p>Server Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} {socketId && <small>(ID: {socketId})</small>}</p>

      {roomError && <p style={{ color: 'red' }}>Room Error: {roomError}</p>}
      {transferError && <p style={{ color: 'red' }}>Transfer Error: {transferError}</p>}

      {!roomId ? (
        <div>
          <h3>1. Select File</h3>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} />
          <br /><br />
          <button onClick={handleCreateRoom} disabled={!file || !isConnected} style={{ padding: '10px' }}>
            Create Share Room
          </button>
        </div>
      ) : (
        <div>
          <h3>2. Share Link</h3>
          <p>Send this link to the receiver (open in new tab to test):</p>
          <input type="text" value={shareUrl} readOnly style={{ width: '100%', maxWidth: '600px', padding: '8px' }} />
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); }}
            style={{ marginLeft: '8px', padding: '8px' }}
          >
            Copy
          </button>

          <h3>3. Transfer Status</h3>
          <p>Status: <strong>{status}</strong></p>
          <p>Progress: {Math.round(progress * 100)}%</p>
          <p>Transferred: {bytesTransferred} / {totalBytes}</p>
          <p>Speed: {speed}</p>
          <p>ETA: {eta}</p>
        </div>
      )}
    </div>
  );
}
