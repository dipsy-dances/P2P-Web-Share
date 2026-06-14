import React from 'react';
import { Github } from 'lucide-react';
import ConnectionStatus from './ConnectionStatus';
import { useSocket } from '../hooks/useSocket';

export default function Navbar() {
  const { isConnected } = useSocket();

  return (
    <nav className="fixed top-0 left-0 right-0 glass z-50 px-6 flex items-center justify-between" style={{ height: '60px', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
      <div className="flex items-center gap-2">
        <div style={{ color: '#eab308' }}>⚡</div>
        <span className="font-bold text-lg" style={{ letterSpacing: '0.025em' }}>P2P Web Share</span>
      </div>
      <div className="flex items-center gap-6">
        <ConnectionStatus status={isConnected ? 'connected' : 'disconnected'} />
        <a href="https://github.com" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="GitHub">
          <Github size={20} />
        </a>
      </div>
    </nav>
  );
}
