/**
 * Hides the contents of the currently viewed battlemap while an immersive scene covers it,
 * and restores it afterwards. The Scene document is never touched: only display flags of canvas
 * groups and layers that core does not reset on its own are changed.
 */

/** Interface layers whose content should disappear under an immersive scene. */
const HIDDEN_LAYERS = ["grid", "regions", "tokens", "tiles", "templates", "drawings", "walls", "notes", "lighting", "sounds"];

export default class SceneMask {
  /** Saved display flags, or null when the map is not hidden. */
  static #saved = null;

  static get active() {
    return this.#saved !== null;
  }

  /** Hide the battlemap. Safe to call repeatedly (e.g. after every canvas redraw). */
  static hide() {
    if ( !canvas?.ready ) return;
    if ( !this.#saved ) {
      this.#saved = {
        environment: canvas.environment.visible,
        visibility: canvas.visibility.renderable,
        layers: {}
      };
      for ( const name of HIDDEN_LAYERS ) {
        const layer = canvas[name];
        if ( layer ) this.#saved.layers[name] = layer.visible;
      }
    }
    canvas.environment.visible = false;
    canvas.visibility.renderable = false;
    for ( const name of HIDDEN_LAYERS ) {
      const layer = canvas[name];
      if ( layer ) layer.visible = false;
    }
    canvas.hud?.token?.close?.();
    canvas.hud?.tile?.close?.();
    canvas.hud?.drawing?.close?.();
  }

  /** Show the battlemap again. */
  static restore() {
    const saved = this.#saved;
    this.#saved = null;
    if ( !saved || !canvas?.ready ) return;
    canvas.environment.visible = saved.environment ?? true;
    canvas.visibility.renderable = saved.visibility ?? true;
    for ( const [name, visible] of Object.entries(saved.layers) ) {
      const layer = canvas[name];
      if ( layer ) layer.visible = visible;
    }
    foundry.canvas.interaction.MouseInteractionManager.emulateMoveEvent();
  }

  /** Forget saved flags after a full canvas redraw (the new canvas starts visible). */
  static reset() {
    this.#saved = null;
  }
}
