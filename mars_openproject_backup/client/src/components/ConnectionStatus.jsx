import React from 'react';

export default function ConnectionStatus({ status }) {
  const isConnected = status === 'connected';
  const color = isConnected ? 'var(--color-success)' : 'var(--color-error)';
  
  return (
    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color,
        boxShadow: `0 0 8px ${color}`
      }} />
      {isConnected ? 'Server Connected' : 'Disconnected'}
    </div>
  );
}
