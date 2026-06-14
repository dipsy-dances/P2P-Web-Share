/**
 * @module TransferStats
 * @description Real-time transfer metrics tracker. Uses a 3-second sliding
 * window for smooth speed calculation and `performance.now()` for
 * high-resolution timing. Provides human-readable formatting helpers.
 */

/**
 * @typedef {Object} Stats
 * @property {number} bytesTransferred - Total bytes transferred so far
 * @property {number} totalBytes - Total expected bytes
 * @property {number} progress - Progress ratio (0 to 1)
 * @property {number} speed - Current speed in bytes/sec (3-second sliding window)
 * @property {number} avgSpeed - Average speed over the entire transfer in bytes/sec
 * @property {number} elapsed - Elapsed time in milliseconds
 * @property {number} eta - Estimated time remaining in milliseconds (Infinity if speed is 0)
 */

/**
 * @typedef {Object} ByteRecord
 * @property {number} timestamp - performance.now() timestamp
 * @property {number} bytes - Number of bytes recorded at this moment
 */

class TransferStats {
  /**
   * Sliding window duration in milliseconds.
   * @type {number}
   */
  static WINDOW_MS = 3000;

  /**
   * Creates a new TransferStats tracker.
   * @param {number} totalBytes - The total number of bytes expected for this transfer.
   * @throws {Error} If totalBytes is not a positive number.
   */
  constructor(totalBytes) {
    if (typeof totalBytes !== 'number' || totalBytes <= 0) {
      throw new Error('TransferStats: totalBytes must be a positive number');
    }

    /** @private @type {number} */
    this._totalBytes = totalBytes;

    /** @private @type {number} */
    this._bytesTransferred = 0;

    /** @private @type {number} */
    this._startTime = performance.now();

    /**
     * Sliding window of recent byte recordings for smooth speed calculation.
     * @private
     * @type {ByteRecord[]}
     */
    this._window = [];
  }

  /**
   * Records that a certain number of bytes were just transferred.
   * @param {number} bytes - Number of bytes transferred in this batch.
   */
  recordBytes(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) return;

    this._bytesTransferred += bytes;
    this._window.push({
      timestamp: performance.now(),
      bytes,
    });

    this._pruneWindow();
  }

  /**
   * Returns a snapshot of all current transfer metrics.
   * @returns {Stats}
   */
  getStats() {
    const now = performance.now();
    const elapsed = now - this._startTime;

    this._pruneWindow();

    // Sliding-window speed
    let speed = 0;
    if (this._window.length > 0) {
      const windowStart = this._window[0].timestamp;
      const windowDuration = (now - windowStart) / 1000; // seconds
      const windowBytes = this._window.reduce((sum, r) => sum + r.bytes, 0);
      speed = windowDuration > 0 ? windowBytes / windowDuration : 0;
    }

    // Average speed over the entire transfer
    const elapsedSec = elapsed / 1000;
    const avgSpeed = elapsedSec > 0 ? this._bytesTransferred / elapsedSec : 0;

    const remaining = this._totalBytes - this._bytesTransferred;
    const eta = speed > 0 ? (remaining / speed) * 1000 : Infinity;

    const progress = this._totalBytes > 0
      ? Math.min(this._bytesTransferred / this._totalBytes, 1)
      : 0;

    return {
      bytesTransferred: this._bytesTransferred,
      totalBytes: this._totalBytes,
      progress,
      speed,
      avgSpeed,
      elapsed,
      eta,
    };
  }

  /**
   * Resets all counters and starts a fresh timing window.
   */
  reset() {
    this._bytesTransferred = 0;
    this._startTime = performance.now();
    this._window = [];
  }

  // ──────────────────────────── Formatting Helpers ────────────────────────────

  /**
   * Formats a byte count into a human-readable string.
   * @param {number} bytes - Number of bytes.
   * @returns {string} e.g. '1.5 MB', '340 KB', '800 B'
   */
  static formatBytes(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    const value = bytes / Math.pow(k, i);

    // Use integer format for bytes, one decimal for everything else
    return i === 0
      ? `${Math.round(value)} ${units[i]}`
      : `${value.toFixed(1)} ${units[i]}`;
  }

  /**
   * Formats a speed (bytes per second) into a human-readable string.
   * @param {number} bytesPerSec - Speed in bytes per second.
   * @returns {string} e.g. '2.3 MB/s', '150 KB/s'
   */
  static formatSpeed(bytesPerSec) {
    return `${TransferStats.formatBytes(bytesPerSec)}/s`;
  }

  /**
   * Formats a duration in milliseconds to a human-readable string.
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} e.g. '1m 23s', '< 1s', '2h 5m'
   */
  static formatTime(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '∞';
    if (ms < 1000) return '< 1s';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
    return `${seconds}s`;
  }

  // ──────────────────────────── Private ────────────────────────────

  /**
   * Removes entries older than the sliding window from the window array.
   * @private
   */
  _pruneWindow() {
    const cutoff = performance.now() - TransferStats.WINDOW_MS;
    // Find the first entry within the window (entries are chronological)
    let firstValid = 0;
    while (firstValid < this._window.length && this._window[firstValid].timestamp < cutoff) {
      firstValid++;
    }
    if (firstValid > 0) {
      this._window.splice(0, firstValid);
    }
  }
}

export default TransferStats;
