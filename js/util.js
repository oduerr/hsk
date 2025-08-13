/**
 * Utility helpers: hashing, shuffle, and tiny helpers.
 */

/**
 * FNV-1a 32-bit hash for stable IDs.
 * Returns hex string without leading 0x.
 * @param {string} str
 * @returns {string}
 */
export function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
  }
  // Convert to unsigned and hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * In-place Fisher-Yates shuffle using a seeded PRNG if provided.
 * @template T
 * @param {T[]} array
 * @param {() => number} [rng=Math.random]
 * @returns {T[]}
 */
export function shuffle(array, rng = Math.random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Clamp a number into [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Format seconds as S with tabular alignment.
 * @param {number} seconds
 */
export function formatSeconds(seconds) {
  return String(seconds);
}


