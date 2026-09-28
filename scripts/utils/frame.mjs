/**
 * Stage frame math. Everything a scene positions (cast, camera shots) is stored as fractions of the
 * "stage frame": the largest rectangle with the configured aspect ratio centred in the scene rectangle
 * of whatever battlemap is currently viewed. This keeps compositions identical on any map.
 */

/**
 * Parse an aspect ratio string like "16:9", "21:9" or "1.5".
 * @param {string|number} value
 * @param {number} [fallback=16/9]
 * @returns {number}
 */
export function parseAspect(value, fallback = 16 / 9) {
  if ( typeof value === "number" ) return (value > 0) && Number.isFinite(value) ? value : fallback;
  const str = String(value ?? "").trim();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/);
  if ( match ) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    return (w > 0) && (h > 0) ? w / h : fallback;
  }
  const n = Number(str);
  return (n > 0) && Number.isFinite(n) ? n : fallback;
}

/**
 * The largest rectangle with the given aspect ratio centred inside `rect`.
 * @param {{x:number, y:number, width:number, height:number}} rect
 * @param {number} aspect   width / height
 * @returns {{x:number, y:number, width:number, height:number}}
 */
export function computeFrame(rect, aspect) {
  let width = rect.width;
  let height = width / aspect;
  if ( height > rect.height ) {
    height = rect.height;
    width = height * aspect;
  }
  return {
    x: rect.x + ((rect.width - width) / 2),
    y: rect.y + ((rect.height - height) / 2),
    width,
    height
  };
}

/** Convert frame fractions to world coordinates. */
export function toWorld(frame, fx, fy) {
  return { x: frame.x + (fx * frame.width), y: frame.y + (fy * frame.height) };
}

/** Convert world coordinates to frame fractions. */
export function toFrame(frame, x, y) {
  return { x: (x - frame.x) / frame.width, y: (y - frame.y) / frame.height };
}

/**
 * Size of a texture fitted into a box.
 * @param {number} texW
 * @param {number} texH
 * @param {number} boxW
 * @param {number} boxH
 * @param {"cover"|"contain"|"stretch"} [fit="cover"]
 * @returns {{width:number, height:number}}
 */
export function fitSize(texW, texH, boxW, boxH, fit = "cover") {
  if ( fit === "stretch" || !texW || !texH ) return { width: boxW, height: boxH };
  const sx = boxW / texW;
  const sy = boxH / texH;
  const s = fit === "contain" ? Math.min(sx, sy) : Math.max(sx, sy);
  return { width: texW * s, height: texH * s };
}

/**
 * Convert a camera shot (frame fractions) into a canvas view for a given screen size.
 * A shot shows `zoom` of the frame: zoom 1 fits the whole frame, 0.5 shows half its width and height.
 * @param {{x:number, y:number, width:number, height:number}} frame
 * @param {{x:number, y:number, zoom:number}} shot
 * @param {{width:number, height:number}} screen
 * @returns {{x:number, y:number, scale:number}}
 */
export function shotToView(frame, shot, screen) {
  const zoom = shot.zoom > 0 ? shot.zoom : 1;
  const base = Math.min(screen.width / frame.width, screen.height / frame.height);
  const world = toWorld(frame, shot.x, shot.y);
  return { x: world.x, y: world.y, scale: base / zoom };
}

/**
 * Inverse of {@link shotToView}: capture the current canvas view as a shot.
 * @param {{x:number, y:number, width:number, height:number}} frame
 * @param {{x:number, y:number, scale:number}} view
 * @param {{width:number, height:number}} screen
 * @returns {{x:number, y:number, zoom:number}}
 */
export function viewToShot(frame, view, screen) {
  const base = Math.min(screen.width / frame.width, screen.height / frame.height);
  const pos = toFrame(frame, view.x, view.y);
  return { x: pos.x, y: pos.y, zoom: base / view.scale };
}
