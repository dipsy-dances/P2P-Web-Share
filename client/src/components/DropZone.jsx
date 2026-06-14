import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

export default function DropZone({ onFileSelected, disabled, maxSize = 500 * 1024 * 1024 }) {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      onFileSelected(acceptedFiles[0]);
    }
  }, [onFileSelected]);

  const { getRootProps, getInputProps, isDragActive, isDragReject, fileRejections } = useDropzone({
    onDrop,
    maxSize,
    multiple: false,
    disabled
  });

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-12">
      <div 
        {...getRootProps()} 
        className={`glass p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{
          border: `2px dashed ${isDragReject ? 'var(--color-error)' : isDragActive ? 'var(--color-primary)' : 'var(--color-glass-border)'}`,
          transform: isDragActive ? 'scale(1.02)' : 'scale(1)',
          background: isDragActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-glass-bg)'
        }}
      >
        <input {...getInputProps()} />
        <UploadCloud size={64} className="mb-6" style={{ color: isDragActive ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
        
        {isDragActive ? (
          <p className="text-xl font-bold text-gradient">Drop the file here...</p>
        ) : (
          <>
            <p className="text-xl font-bold mb-2">Drag & drop your file here</p>
            <p className="text-sm text-gray-400">or click to browse from your device</p>
          </>
        )}
        
        <p className="text-xs text-gray-500 mt-4 font-mono">Max size: {formatSize(maxSize)}</p>
      </div>

      {fileRejections.length > 0 && (
        <div className="mt-4 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 text-sm text-center">
          {fileRejections[0].errors[0].message}
        </div>
      )}
    </div>
  );
}
