/**
 * World-space layer for Token and Hero mode. It lives in the interface group above every
 * placeable layer (tokens, tiles, walls, lighting…) but below the controls layer, so pings,
 * cursors and rulers remain visible on top of the immersive scene.
 */
export default class ImmersiveStageLayer extends foundry.canvas.layers.CanvasLayer {
  constructor() {
    super();
    this.eventMode = "passive";
    this.interactiveChildren = true;
    this.sortableChildren = true;
  }

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, { name: "immersiveStage", zIndex: 950 });
  }

  /** Container for the backdrop (colour fill, blurred surround and framed image). */
  backdrop;

  /** Container for cast members, sorted by z. */
  cast;

  async _draw(options) {
    await super._draw(options);
    this.backdrop = this.addChild(new PIXI.Container());
    this.backdrop.eventMode = "none";
    this.backdrop.zIndex = 0;
    this.cast = this.addChild(new PIXI.Container());
    this.cast.sortableChildren = true;
    this.cast.eventMode = "passive";
    this.cast.zIndex = 1;
    Hooks.callAll("immersive-scenes.layerDrawn", this);
  }

  async _tearDown(options) {
    Hooks.callAll("immersive-scenes.layerTearDown", this);
    this.backdrop = this.cast = undefined;
    return super._tearDown(options);
  }
}
