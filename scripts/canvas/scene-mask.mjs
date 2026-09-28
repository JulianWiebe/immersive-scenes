/**
 * Hides the contents of the currently viewed battlemap while an immersive scene covers it,
 * and restores it afterwards. The Scene document is never touched: only display flags of canvas
 * groups and layers that core does not reset on its own are changed.
 */

/** Interface layers whose content should disappear under an immersive scene. */
const HIDDEN_LAYERS = ["grid", "regions", "tokens", "tiles", "templates", "drawings", "walls", "notes", "lighting", "sounds"];

/** Interface layers are looked up on the group: `canvas.grid` is the scene's grid data, not the layer. */
const layer = name => canvas.interface?.layers?.[name] ?? null;

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
        doors: canvas.controls?.doors?.renderable ?? true,
        layers: {}
      };
      for ( const name of HIDDEN_LAYERS ) {
        const l = layer(name);
        if ( l ) this.#saved.layers[name] = l.visible;
      }
    }
    canvas.environment.visible = false;
    canvas.visibility.renderable = false;
    // Door icons live in the controls layer, above the stage. `visible` is reset by core, `renderable` is not.
    if ( canvas.controls?.doors ) canvas.controls.doors.renderable = false;
    for ( const name of HIDDEN_LAYERS ) {
      const l = layer(name);
      if ( l ) l.visible = false;
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
    if ( canvas.controls?.doors ) canvas.controls.doors.renderable = saved.doors ?? true;
    for ( const [name, visible] of Object.entries(saved.layers) ) {
      const l = layer(name);
      if ( l ) l.visible = visible ?? true;
    }
    foundry.canvas.interaction.MouseInteractionManager.emulateMoveEvent();
  }

  /** Forget saved flags after a full canvas redraw (the new canvas starts visible). */
  static reset() {
    this.#saved = null;
  }
}
