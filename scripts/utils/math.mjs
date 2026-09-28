/** Clamp a number into [min, max]; non-finite numbers fall back to `fallback` (or min). */
export function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if ( !Number.isFinite(n) ) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + ((b - a) * t);
}

/** Deep clone plain JSON data. */
export function clone(data) {
  return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
}

/** Structural equality for plain JSON data. */
export function jsonEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
