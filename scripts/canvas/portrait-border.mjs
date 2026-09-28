/**
 * The border around a Token-mode portrait. Drawn with PIXI.Graphics for static styles;
 * animated styles are rendered by the BorderShader (see border-mesh.mjs) when available.
 */
export default class PortraitBorder extends PIXI.Container {
  constructor() {
    super();
    this.graphics = this.addChild(new PIXI.Graphics());
  }

  /**
   * Redraw the border.
   * @param {number} diameter   Portrait size in pixels
   * @param {object} border     Normalized border config
   */
  update(diameter, border) {
    const g = this.graphics;
    g.clear();
    if ( border.style === "none" ) return;
    const width = Math.max(1, border.width * diameter);
    const color = Number.parseInt(border.colors[0].slice(1), 16);
    const second = Number.parseInt(border.colors[1].slice(1), 16);
    const outer = diameter / 2;
    drawRing(g, border.shape, outer, width, color, 1);
    if ( border.style === "double" ) drawRing(g, border.shape, outer - (width * 1.6), width * 0.45, second, 1);
  }
}

/**
 * Draw a ring of a given shape centred on the origin.
 * @param {PIXI.Graphics} g
 * @param {"circle"|"rounded"|"square"} shape
 * @param {number} outer    Outer radius (half size)
 * @param {number} width    Ring width
 * @param {number} color
 * @param {number} alpha
 */
export function drawRing(g, shape, outer, width, color, alpha) {
  const r = outer - (width / 2);
  g.lineStyle({ width, color, alpha, alignment: 0.5 });
  if ( shape === "circle" ) g.drawCircle(0, 0, r);
  else if ( shape === "rounded" ) g.drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.25);
  else g.drawRect(-r, -r, r * 2, r * 2);
  g.lineStyle(0);
}

/**
 * Draw a filled shape used as a portrait mask.
 * @param {PIXI.Graphics} g
 * @param {"circle"|"rounded"|"square"} shape
 * @param {number} radius
 */
export function drawShape(g, shape, radius) {
  g.beginFill(0xffffff, 1);
  if ( shape === "circle" ) g.drawCircle(0, 0, radius);
  else if ( shape === "rounded" ) g.drawRoundedRect(-radius, -radius, radius * 2, radius * 2, radius * 0.25);
  else g.drawRect(-radius, -radius, radius * 2, radius * 2);
  g.endFill();
}
