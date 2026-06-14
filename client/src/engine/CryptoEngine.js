export default class CryptoEngine {
  static async generateKey() {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    const keyString = btoa(String.fromCharCode(...new Uint8Array(exported)));
    return { key, keyString: CryptoEngine.keyToUrlSafe(keyString) };
  }

  static async importKey(keyString) {
    const base64 = CryptoEngine.keyFromUrlSafe(keyString);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
  }

  static async encryptChunk(key, chunkData) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      chunkData
    );
    // prepend IV to ciphertext
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result.buffer;
  }

  static async decryptChunk(key, encryptedData) {
    const encryptedArray = new Uint8Array(encryptedData);
    const iv = encryptedArray.slice(0, 12);
    const ciphertext = encryptedArray.slice(12);
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
  }

  static keyToUrlSafe(keyString) {
    return keyString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  static keyFromUrlSafe(urlSafe) {
    let base64 = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return base64;
  }
}
