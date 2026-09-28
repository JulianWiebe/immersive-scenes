/**
 * Camera helpers. Nothing here locks the view: every client can pan and zoom freely at any time.
 */
import { shotToView } from "../utils/frame.mjs";
import { reducedMotion } from "../settings.mjs";

export default class Camera {
  /** The view before the immersive scene started, restored when it ends. */
  static #saved = null;

  /** Current canvas view. */
  static current() {
    return { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
  }

  /** Screen size of the canvas in CSS pixels. */
  static screen() {
    const { width, height } = canvas.app.renderer.screen;
    return { width, height };
  }

  /** Remember the current view (only once per broadcast). */
  static save() {
    if ( canvas?.ready && !this.#saved ) this.#saved = { sceneId: canvas.scene.id, ...this.current() };
  }

  /** Return to the remembered view, if still on the same map. */
  static async restore({ duration = 0 } = {}) {
    const saved = this.#saved;
    this.#saved = null;
    if ( !saved || !canvas?.ready || (saved.sceneId !== canvas.scene.id) ) return;
    await this.pan(saved, { duration });
  }

  /** Forget the remembered view. */
  static forget() {
    this.#saved = null;
  }

  /**
   * Move the camera so a shot (frame fractions) fills the screen.
   * @param {{x:number,y:number,width:number,height:number}} frame
   * @param {{x:number,y:number,zoom:number}} shot
   * @param {object} [options]
   * @param {number} [options.duration=0]
   * @param {string} [options.easing]
   */
  static async showShot(frame, shot, { duration = 0, easing } = {}) {
    if ( !canvas?.ready ) return;
    const view = shotToView(frame, shot, this.screen());
    await this.pan(view, { duration, easing });
  }

  /** Pan to a view, clamped to the canvas zoom limits. */
  static async pan({ x, y, scale }, { duration = 0, easing } = {}) {
    const limits = canvas.dimensions.scale;
    const target = { x, y, scale: Math.clamp(scale, limits.min, limits.max) };
    if ( !duration || reducedMotion() ) return canvas.pan(target);
    return canvas.animatePan({ ...target, duration, easing });
  }
}
