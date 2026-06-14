import React from 'react';

export default function PeerList({ peers }) {
  if (!peers || peers.length === 0) {
    return (
      <div className="mt-8 text-center p-8 glass" style={{ animation: 'pulse-ring 2s infinite' }}>
        <p className="text-gray-400 font-medium">Waiting for peers to join...</p>
      </div>
    );
  }

  return (
    <div className="w-full mt-8 max-w-md mx-auto">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Connected Peers</h4>
      <div className="flex flex-col gap-3">
        {peers.map((peer, idx) => (
          <div key={idx} className="glass p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" 
                   style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}>
                {peer.id ? peer.id.substring(0, 2).toUpperCase() : 'P' + (idx+1)}
              </div>
              <div>
                <p className="font-medium">Peer {peer.id ? peer.id.substring(0, 5) : idx+1}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: peer.status === 'connected' ? 'var(--color-success)' : 'var(--color-warning)' }} />
                  <span className="text-xs text-gray-400">{peer.status || 'connected'}</span>
                </div>
              </div>
            </div>
            {peer.speed && (
              <div className="text-sm font-medium text-cyan-400">
                {peer.speed}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
