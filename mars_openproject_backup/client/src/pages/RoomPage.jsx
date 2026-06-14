import React, { useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useTransfer } from '../hooks/useTransfer';

export default function RoomPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const encryptionKey = location.hash.replace('#key=', '');

  const { socket, isConnected, socketId } = useSocket();
  const { status, progress, speed, eta, bytesTransferred, totalBytes, startReceiving, downloadUrl, fileName, error } = useTransfer();

  useEffect(() => {
    if (status === 'idle' && isConnected && socket) {
      startReceiving(roomId, socket, encryptionKey);
    }
  }, [roomId, encryptionKey, status, isConnected, socket, startReceiving]);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Receiver Node</h1>
      <p>Server Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} {socketId && <small>(ID: {socketId})</small>}</p>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <div>
        <h3>Transfer Status</h3>
        <p>Status: <strong>{status}</strong></p>
        <p>Progress: {Math.round(progress * 100)}%</p>
        <p>Transferred: {bytesTransferred} / {totalBytes}</p>
        <p>Speed: {speed}</p>
        <p>ETA: {eta}</p>

        {downloadUrl && (
          <div style={{ marginTop: '20px' }}>
            <a href={downloadUrl} download={fileName || 'received_file'}>
              <button style={{ padding: '10px 20px', fontSize: '16px', background: 'green', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Download: {fileName || 'received_file'}
              </button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
