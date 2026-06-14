import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';

let globalSocket = null;

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity
      });
    }

    socketRef.current = globalSocket;

    const onConnect = () => {
      setIsConnected(true);
      setSocketId(globalSocket.id);
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setSocketId(null);
    };

    if (globalSocket.connected) {
      onConnect();
    }

    globalSocket.on('connect', onConnect);
    globalSocket.on('disconnect', onDisconnect);

    return () => {
      globalSocket.off('connect', onConnect);
      globalSocket.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, isConnected, socketId };
}
