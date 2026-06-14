/**
 * @module StorageManager
 * @description Persistent chunk storage for large file transfers. Uses the
 * Origin Private File System (OPFS) for high-performance random-access writes
 * when available, and falls back to IndexedDB on browsers that lack OPFS support.
 *
 * Usage:
 *   const storage = new StorageManager('video.mp4');
 *   await storage.init();
 *   await storage.writeChunk(0, chunkBuffer);
 *   const data = await storage.readChunk(0);
 *   await storage.cleanup();
 */

class StorageManager {
  /**
   * IndexedDB database name prefix.
   * @private @type {string}
   */
  static _IDB_PREFIX = 'mars-filetransfer-';

  /**
   * IndexedDB object store name.
   * @private @type {string}
   */
  static _IDB_STORE = 'chunks';

  /**
   * OPFS directory name for temporary transfer files.
   * @private @type {string}
   */
  static _OPFS_DIR = '.mars-transfers';

  /**
   * Creates a new StorageManager for a specific file.
   * @param {string} fileName - The name of the file being stored.
   *   Used to create a unique storage location.
   * @throws {Error} If fileName is empty.
   */
  constructor(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('StorageManager: fileName is required');
    }

    /** @private @type {string} */
    this._fileName = fileName;

    /** @private @type {string} */
    this._safeFileName = this._sanitizeFileName(fileName);

    /** @private @type {boolean} */
    this._useOPFS = false;

    /** @private @type {boolean} */
    this._initialized = false;

    /**
     * OPFS directory handle for this transfer.
     * @private @type {FileSystemDirectoryHandle|null}
     */
    this._opfsDir = null;

    /**
     * IndexedDB database instance (fallback).
     * @private @type {IDBDatabase|null}
     */
    this._idb = null;

    /**
     * IDB database name (unique per file).
     * @private @type {string}
     */
    this._idbName = StorageManager._IDB_PREFIX + this._safeFileName;
  }

  // ──────────────────────────── Public API ────────────────────────────

  /**
   * Initializes the storage backend. Detects OPFS support and falls back
   * to IndexedDB if necessary. Must be called before any read/write operations.
   * @returns {Promise<void>}
   * @throws {Error} If neither OPFS nor IndexedDB is available.
   */
  async init() {
    if (this._initialized) return;

    if (this.isOPFSSupported()) {
      try {
        const root = await navigator.storage.getDirectory();
        this._opfsDir = await root.getDirectoryHandle(StorageManager._OPFS_DIR, {
          create: true,
        });
        this._useOPFS = true;
        this._initialized = true;
        return;
      } catch (err) {
        console.warn('StorageManager: OPFS initialization failed, falling back to IndexedDB', err);
      }
    }

    // Fallback to IndexedDB
    if (typeof indexedDB === 'undefined') {
      throw new Error('StorageManager: neither OPFS nor IndexedDB is available');
    }

    this._idb = await this._openIDB();
    this._useOPFS = false;
    this._initialized = true;
  }

  /**
   * Writes a chunk at the given index.
   * @param {number} index - Zero-based chunk index.
   * @param {ArrayBuffer} data - The chunk data to store.
   * @returns {Promise<void>}
   * @throws {Error} If not initialized.
   */
  async writeChunk(index, data) {
    this._ensureInitialized();

    if (this._useOPFS) {
      await this._opfsWriteChunk(index, data);
    } else {
      await this._idbWriteChunk(index, data);
    }
  }

  /**
   * Reads a chunk back by index.
   * @param {number} index - Zero-based chunk index.
   * @returns {Promise<ArrayBuffer|null>} The chunk data, or null if not found.
   * @throws {Error} If not initialized.
   */
  async readChunk(index) {
    this._ensureInitialized();

    if (this._useOPFS) {
      return this._opfsReadChunk(index);
    }
    return this._idbReadChunk(index);
  }

  /**
   * Reads all chunks in order, returning an array of ArrayBuffers.
   * @param {number} totalChunks - Total number of chunks to read.
   * @returns {Promise<ArrayBuffer[]>} Ordered array of chunk data.
   * @throws {Error} If any chunk is missing.
   */
  async readAllChunks(totalChunks) {
    this._ensureInitialized();

    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const data = await this.readChunk(i);
      if (!data) {
        throw new Error(`StorageManager.readAllChunks: chunk ${i} is missing`);
      }
      chunks.push(data);
    }
    return chunks;
  }

  /**
   * Returns the set of chunk indices currently stored.
   * @returns {Promise<Set<number>>} Set of stored chunk indices.
   * @throws {Error} If not initialized.
   */
  async getStoredChunkIndices() {
    this._ensureInitialized();

    if (this._useOPFS) {
      return this._opfsGetStoredIndices();
    }
    return this._idbGetStoredIndices();
  }

  /**
   * Removes all stored data (OPFS files or IDB entries) for this transfer.
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this._useOPFS && this._opfsDir) {
      try {
        // Remove all chunk files for this transfer
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(StorageManager._OPFS_DIR, { recursive: true });
      } catch (err) {
        console.warn('StorageManager: OPFS cleanup error', err);
      }
      this._opfsDir = null;
    }

    if (this._idb) {
      this._idb.close();
      this._idb = null;

      try {
        await this._deleteIDB();
      } catch (err) {
        console.warn('StorageManager: IDB cleanup error', err);
      }
    }

    this._initialized = false;
  }

  /**
   * Checks whether the Origin Private File System API is available.
   * @returns {boolean} True if OPFS is supported.
   */
  isOPFSSupported() {
    return (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  /**
   * Returns a storage estimate from the browser.
   * @returns {Promise<{usage: number, quota: number}>} Storage usage and quota in bytes.
   */
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    return { usage: 0, quota: 0 };
  }

  // ──────────────────────────── OPFS Backend ────────────────────────────

  /**
   * Writes a chunk to OPFS as an individual file.
   * @private
   * @param {number} index
   * @param {ArrayBuffer} data
   */
  async _opfsWriteChunk(index, data) {
    const name = this._chunkFileName(index);
    const fileHandle = await this._opfsDir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  /**
   * Reads a chunk from OPFS.
   * @private
   * @param {number} index
   * @returns {Promise<ArrayBuffer|null>}
   */
  async _opfsReadChunk(index) {
    const name = this._chunkFileName(index);
    try {
      const fileHandle = await this._opfsDir.getFileHandle(name);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch (err) {
      // NotFoundError means the chunk doesn't exist
      if (err.name === 'NotFoundError') return null;
      throw err;
    }
  }

  /**
   * Returns the set of chunk indices stored in OPFS.
   * @private
   * @returns {Promise<Set<number>>}
   */
  async _opfsGetStoredIndices() {
    const indices = new Set();
    const prefix = `${this._safeFileName}_chunk_`;

    for await (const [name] of this._opfsDir.entries()) {
      if (name.startsWith(prefix)) {
        const indexStr = name.slice(prefix.length);
        const parsed = parseInt(indexStr, 10);
        if (!isNaN(parsed)) {
          indices.add(parsed);
        }
      }
    }
    return indices;
  }

  // ──────────────────────────── IndexedDB Backend ────────────────────────────

  /**
   * Opens (or creates) the IndexedDB database for this file.
   * @private
   * @returns {Promise<IDBDatabase>}
   */
  _openIDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._idbName, 1);

      request.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        if (!db.objectStoreNames.contains(StorageManager._IDB_STORE)) {
          db.createObjectStore(StorageManager._IDB_STORE);
        }
      };

      request.onsuccess = (event) => {
        resolve(/** @type {IDBOpenDBRequest} */ (event.target).result);
      };

      request.onerror = (event) => {
        reject(new Error(
          `StorageManager: failed to open IndexedDB "${this._idbName}" — ` +
          /** @type {IDBOpenDBRequest} */ (event.target).error?.message
        ));
      };
    });
  }

  /**
   * Deletes the IndexedDB database for this file.
   * @private
   * @returns {Promise<void>}
   */
  _deleteIDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this._idbName);
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error(
          `StorageManager: failed to delete IndexedDB "${this._idbName}" — ` +
          /** @type {IDBOpenDBRequest} */ (event.target).error?.message
        ));
      };
    });
  }

  /**
   * Writes a chunk to IndexedDB.
   * @private
   * @param {number} index
   * @param {ArrayBuffer} data
   * @returns {Promise<void>}
   */
  _idbWriteChunk(index, data) {
    return new Promise((resolve, reject) => {
      const tx = this._idb.transaction(StorageManager._IDB_STORE, 'readwrite');
      const store = tx.objectStore(StorageManager._IDB_STORE);
      const request = store.put(data, index);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error(
          `StorageManager: IDB write failed for chunk ${index} — ` +
          /** @type {IDBRequest} */ (event.target).error?.message
        ));
      };
    });
  }

  /**
   * Reads a chunk from IndexedDB.
   * @private
   * @param {number} index
   * @returns {Promise<ArrayBuffer|null>}
   */
  _idbReadChunk(index) {
    return new Promise((resolve, reject) => {
      const tx = this._idb.transaction(StorageManager._IDB_STORE, 'readonly');
      const store = tx.objectStore(StorageManager._IDB_STORE);
      const request = store.get(index);

      request.onsuccess = (event) => {
        const result = /** @type {IDBRequest} */ (event.target).result;
        resolve(result || null);
      };

      request.onerror = (event) => {
        reject(new Error(
          `StorageManager: IDB read failed for chunk ${index} — ` +
          /** @type {IDBRequest} */ (event.target).error?.message
        ));
      };
    });
  }

  /**
   * Returns the set of chunk indices stored in IndexedDB.
   * @private
   * @returns {Promise<Set<number>>}
   */
  _idbGetStoredIndices() {
    return new Promise((resolve, reject) => {
      const tx = this._idb.transaction(StorageManager._IDB_STORE, 'readonly');
      const store = tx.objectStore(StorageManager._IDB_STORE);
      const request = store.getAllKeys();

      request.onsuccess = (event) => {
        const keys = /** @type {IDBRequest} */ (event.target).result;
        resolve(new Set(keys.filter((k) => typeof k === 'number')));
      };

      request.onerror = (event) => {
        reject(new Error(
          `StorageManager: IDB getAllKeys failed — ` +
          /** @type {IDBRequest} */ (event.target).error?.message
        ));
      };
    });
  }

  // ──────────────────────────── Helpers ────────────────────────────

  /**
   * Throws if init() hasn't been called yet.
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('StorageManager: not initialized — call init() first');
    }
  }

  /**
   * Generates the OPFS file name for a chunk.
   * @private
   * @param {number} index
   * @returns {string}
   */
  _chunkFileName(index) {
    return `${this._safeFileName}_chunk_${index}`;
  }

  /**
   * Sanitizes a file name for use as a storage key by replacing unsafe
   * characters with underscores.
   * @private
   * @param {string} name
   * @returns {string}
   */
  _sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

export default StorageManager;
