/**
 * Screen-space layer for Cast-Only mode. It belongs to the canvas overlay group, which is not bound
 * to the stage transform, so the cast stays anchored to the viewport while the battlemap underneath
 * remains visible and fully interactive.
 */
export default class ImmersiveOverlayLayer extends foundry.canvas.layers.CanvasLayer {
  constructor() {
    super();
    this.eventMode = "passive";
    this.interactiveChildren = true;
    this.sortableChildren = true;
  }

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, { name: "immersiveOverlay", zIndex: 100 });
  }

  /** Container for cast members, sorted by z. */
  cast;

  async _draw(options) {
    await super._draw(options);
    this.cast = this.addChild(new PIXI.Container());
    this.cast.sortableChildren = true;
    this.cast.eventMode = "passive";
  }

  async _tearDown(options) {
    this.cast = undefined;
    return super._tearDown(options);
  }
}
