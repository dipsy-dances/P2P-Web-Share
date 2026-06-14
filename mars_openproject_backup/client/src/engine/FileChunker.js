export default class FileChunker {
  constructor(file, chunkSize = 16 * 1024) {
    this.file = file;
    this.chunkSize = chunkSize;
  }

  async generateManifest() {
    const fileBuffer = await this.file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      totalChunks: this.getTotalChunks(),
      fileHash,
      chunkSize: this.chunkSize
    };
  }

  getTotalChunks() {
    return Math.ceil(this.file.size / this.chunkSize);
  }

  async getChunk(index) {
    const offset = index * this.chunkSize;
    const size = Math.min(this.chunkSize, this.file.size - offset);
    const blob = this.file.slice(offset, offset + size);
    const data = await blob.arrayBuffer();
    return { index, offset, size, data };
  }

  async getChunkHash(chunkData) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', chunkData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static arrayBufferToHex(buffer) {
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
