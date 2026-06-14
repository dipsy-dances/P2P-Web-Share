import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';

export function useRoom() {
  const { socket, isConnected } = useSocket();
  const [roomId, setRoomId] = useState(null);
  const [roomInfo, setRoomInfo] = useState(null);
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState(null);

  const createRoom = useCallback((fileMetadata) => {
    if (!socket || !isConnected) return;
    socket.emit('create-room', fileMetadata, (response) => {
      if (response.error) {
        setError(response.error);
      } else {
        setRoomId(response.roomId);
        setRoomInfo({ fileMetadata, isHost: true });
      }
    });
  }, [socket, isConnected]);

  const joinRoom = useCallback((id) => {
    if (!socket || !isConnected) return;
    socket.emit('join-room', id, (response) => {
      if (response.error) {
        setError(response.error);
      } else {
        setRoomId(id);
        setRoomInfo(response.roomInfo);
      }
    });
  }, [socket, isConnected]);

  useEffect(() => {
    if (!socket) return;

    const onPeerJoined = ({ peerId }) => {
      setPeers(prev => {
        if (!prev.includes(peerId)) return [...prev, peerId];
        return prev;
      });
    };

    const onPeerLeft = ({ peerId }) => {
      setPeers(prev => prev.filter(p => p !== peerId));
    };

    socket.on('peer-joined', onPeerJoined);
    socket.on('peer-left', onPeerLeft);

    return () => {
      socket.off('peer-joined', onPeerJoined);
      socket.off('peer-left', onPeerLeft);
    };
  }, [socket]);

  return { roomId, roomInfo, peers, createRoom, joinRoom, error };
}
