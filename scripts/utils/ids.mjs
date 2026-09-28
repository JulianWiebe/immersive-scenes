const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random id compatible with Foundry's id format (alphanumeric, 16 chars by default).
 * @param {number} [length=16]
 * @returns {string}
 */
export function randomId(length = 16) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for ( const b of bytes ) id += ALPHABET[b % ALPHABET.length];
  return id;
}
