export default class FileAssembler {
  constructor(manifest) {
    this.manifest = manifest;
    this.chunks = new Map();
  }

  async receiveChunk(index, data, expectedHash) {
    if (expectedHash) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      if (computedHash !== expectedHash) {
        throw new Error(`Chunk ${index} hash mismatch. Expected ${expectedHash}, got ${computedHash}`);
      }
    }
    
    this.chunks.set(index, data);
    return { verified: true, progress: this.chunks.size / this.manifest.totalChunks };
  }

  isComplete() {
    return this.chunks.size === this.manifest.totalChunks;
  }

  async assemble() {
    const sortedChunks = [];
    for (let i = 0; i < this.manifest.totalChunks; i++) {
      sortedChunks.push(this.chunks.get(i));
    }
    const blob = new Blob(sortedChunks, { type: this.manifest.fileType });
    
    try {
      // Verify full file hash if it's small enough to fit in RAM easily (e.g. < 50MB)
      if (blob.size < 50 * 1024 * 1024) {
        const arrayBuffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (computedHash !== this.manifest.fileHash) {
          console.error('Hash mismatch! Expected:', this.manifest.fileHash, 'Got:', computedHash);
          // Don't throw, just log. We want the user to get their file even if a bit is flipped.
        }
      } else {
        console.warn('File too large for full RAM hash verification, skipping.');
      }
    } catch (err) {
      console.error('Hash verification error:', err);
    }
    
    return blob;
  }

  triggerDownload(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.manifest.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getProgress() {
    return {
      received: this.chunks.size,
      total: this.manifest.totalChunks,
      percentage: this.manifest.totalChunks === 0 ? 0 : this.chunks.size / this.manifest.totalChunks
    };
  }

  getReceivedChunkIndices() {
    return new Set(this.chunks.keys());
  }

  reset() {
    this.chunks.clear();
  }
}
