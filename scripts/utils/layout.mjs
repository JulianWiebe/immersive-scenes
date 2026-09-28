/**
 * Cast layout math (pure). Computes where each visible cast member stands inside the stage frame.
 *
 * Positions are frame fractions. The anchor point depends on the display mode:
 * - "hero": bottom-centre of the full-body sprite (the feet line)
 * - "token"/"cast": centre of the portrait
 *
 * Returned `size` is the display height as a fraction of the frame height (sprite height for hero,
 * portrait diameter for token), already multiplied by the entry scale and any layout fit factor.
 */
import { lerp } from "./math.mjs";

/**
 * @typedef {object} Placement
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} size    Display height as fraction of frame height
 * @property {number} z       Draw order (higher is in front)
 */

/**
 * Compute placements for all visible entries.
 * @param {object} layout            A normalized scene layout
 * @param {object[]} entries         Normalized cast entries (hidden ones are skipped)
 * @param {object} options
 * @param {"hero"|"token"|"cast"} options.mode
 * @param {number} [options.aspect=16/9]  Frame width / height
 * @param {(entry: object) => number} [options.lookScale]  Extra scale per entry (e.g. from the look)
 * @returns {Map<string, Placement>}
 */
export function computeLayout(layout, entries, { mode, aspect = 16 / 9, lookScale = () => 1 } = {}) {
  const visible = entries.filter(e => !e.hidden);
  const hero = mode === "hero";
  const base = hero ? layout.heroSize : layout.tokenSize;
  const out = new Map();
  const n = visible.length;
  if ( !n ) return out;

  const place = (entry, i, x, y, fit = 1) => {
    const z = entry.z ?? i;
    out.set(entry.id, { id: entry.id, x, y, size: base * fit * entry.scale * lookScale(entry), z });
  };

  switch ( layout.type ) {
    case "free":
      visible.forEach((e, i) => place(e, i, e.x, e.y));
      break;

    case "theater": {
      // Freeform with depth: entries further up (smaller y) are further away, so smaller and drawn behind.
      visible.forEach((e, i) => {
        const depthScale = lerp(1 - layout.depth, 1, Math.min(1, Math.max(0, e.y)));
        const z = e.z ?? (e.y * 1000) + i;
        out.set(e.id, { id: e.id, x: e.x, y: e.y, size: base * depthScale * e.scale * lookScale(e), z });
      });
      break;
    }

    case "column": {
      const x = axisPosition(layout.anchor, "x", { hero, base, aspect, margin: layout.margin });
      const ys = spread(n, layout.spacing, layout.margin, hero ? 0 : base);
      visible.forEach((e, i) => {
        // For heroes a column is a diagonal line into depth: the feet line moves down the frame.
        const y = hero ? lerp(1 - layout.margin - ((n - 1) * layout.spacing * 0.5), 1 - layout.margin, n > 1 ? i / (n - 1) : 1) : ys[i];
        place(e, i, x, hero ? Math.min(y, 1) : y);
      });
      break;
    }

    case "grid": {
      const columns = layout.columns || Math.ceil(Math.sqrt(n));
      const rows = layout.rows || Math.ceil(n / columns);
      const usableW = 1 - (2 * layout.margin);
      const usableH = 1 - (2 * layout.margin);
      const cellW = usableW / columns;
      const cellH = usableH / rows;
      // Shrink members so they fit into a cell (widths are converted with the aspect ratio)
      const fit = hero
        ? Math.min(1, (cellH * 0.98) / base)
        : Math.min(1, (cellH * 0.9) / base, (cellW * aspect * 0.9) / base);
      visible.forEach((e, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        if ( row >= rows ) return; // Overflowing entries are not shown in a fixed grid
        // Centre an incomplete last row
        const inRow = Math.min(columns, n - (row * columns));
        const offset = (columns - inRow) * cellW / 2;
        const x = layout.margin + offset + (col * cellW) + (cellW / 2);
        const y = hero ? layout.margin + ((row + 1) * cellH) : layout.margin + (row * cellH) + (cellH / 2);
        place(e, i, x, y, fit);
      });
      break;
    }

    case "row":
    default: {
      const y = axisPosition(layout.anchor, "y", { hero, base, aspect, margin: layout.margin });
      const sizeW = hero ? 0 : base / aspect;
      const xs = spread(n, layout.spacing, layout.margin, sizeW);
      visible.forEach((e, i) => place(e, i, xs[i], y));
      break;
    }
  }
  return out;
}

/**
 * Evenly spread `n` centres around 0.5 along one axis.
 * @param {number} n
 * @param {number} spacing   Preferred distance between centres
 * @param {number} margin    Distance to keep from the frame edge
 * @param {number} extent    Size of one member along this axis (keeps members inside the margins)
 * @returns {number[]}
 */
export function spread(n, spacing, margin, extent = 0) {
  if ( n <= 1 ) return [0.5];
  const available = Math.max(0, 1 - (2 * margin) - extent);
  const step = Math.min(spacing, available / (n - 1));
  const start = 0.5 - ((step * (n - 1)) / 2);
  return Array.from({ length: n }, (_, i) => start + (i * step));
}

/** Position of a row (y) or column (x) line from the layout anchor. */
function axisPosition(anchor, axis, { hero, base, aspect, margin }) {
  if ( axis === "y" ) {
    if ( hero ) {
      if ( anchor === "top" ) return Math.min(1, margin + base);
      if ( anchor === "center" ) return Math.min(1, 0.5 + (base / 2));
      return 1 - margin * 0.25; // Feet near the bottom edge
    }
    if ( anchor === "top" ) return margin + (base / 2);
    if ( anchor === "center" ) return 0.5;
    return 1 - margin - (base / 2);
  }
  const half = hero ? (base * 0.25) / aspect : (base / 2) / aspect;
  if ( anchor === "left" ) return margin + half;
  if ( anchor === "right" ) return 1 - margin - half;
  return 0.5;
}

/**
 * Convert computed placements back into freeform coordinates, e.g. when the GM starts dragging a
 * member in a slot-based layout. Entries keep their scale; x/y are replaced by their current slot.
 * @param {object[]} entries
 * @param {Map<string, Placement>} placements
 * @returns {object[]}
 */
export function materialize(entries, placements) {
  return entries.map(e => {
    const p = placements.get(e.id);
    return p ? { ...e, x: round(p.x), y: round(p.y) } : { ...e };
  });
}

const round = v => Math.round(v * 10000) / 10000;
