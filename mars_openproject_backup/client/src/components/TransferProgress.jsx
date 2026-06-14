import React from 'react';
import { motion } from 'framer-motion';

export default function TransferProgress({ progress, speed, eta, bytesTransferred, totalBytes, status, fileName, fileSize }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className="glass-panel p-8 w-full max-w-md mx-auto flex flex-col items-center gap-6 mt-8">
      <div className="w-full text-center mb-2">
        <h3 className="font-bold text-lg truncate" title={fileName}>{fileName}</h3>
        <p className="text-sm text-gray-400">{bytesTransferred} / {totalBytes || fileSize}</p>
      </div>

      <div className="relative flex items-center justify-center w-32 h-32">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="var(--color-glass-border)"
            strokeWidth="8"
            fill="transparent"
          />
          <motion.circle
            cx="64"
            cy="64"
            r={radius}
            stroke="url(#gradient)"
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop offset="100%" stopColor="var(--color-tertiary)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{Math.round(progress * 100)}%</span>
        </div>
      </div>

      <div className="w-full flex justify-between text-sm px-4">
        <div className="flex flex-col">
          <span className="text-gray-400">Speed</span>
          <span className="font-mono text-cyan-400 font-medium">{speed || '0 B/s'}</span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-gray-400">ETA</span>
          <span className="font-mono text-cyan-400 font-medium">{eta || '--'}</span>
        </div>
      </div>

      <div className="w-full mt-2 pt-4 border-t border-[var(--color-glass-border)] text-center" style={{ borderTopColor: 'var(--color-glass-border)', borderTopStyle: 'solid', borderTopWidth: 1 }}>
        <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full inline-block mt-2" 
              style={{ 
                backgroundColor: status === 'complete' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                color: status === 'complete' ? 'var(--color-success)' : 'var(--color-primary)'
              }}>
          {status}
        </span>
      </div>
    </div>
  );
}
