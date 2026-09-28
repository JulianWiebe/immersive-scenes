/**
 * Draws a view (see utils/resolve.mjs#buildView) into the canvas and animates the difference
 * between consecutive views. Views are applied one after another; if several arrive while one
 * is being applied, only the latest is kept.
 */
import { MODULE_ID } from "../constants.mjs";
import { diffViews } from "../utils/diff.mjs";
import { computeFrame, parseAspect } from "../utils/frame.mjs";
import { getSetting, reducedMotion } from "../settings.mjs";
import SceneMask from "./scene-mask.mjs";
import Backdrop from "./backdrop.mjs";
import CastSprite from "./cast-sprite.mjs";
import Camera from "./camera.mjs";
import { preloadTextures } from "./texture-cache.mjs";

export default class StageRenderer {
  /** The view currently drawn (or being drawn). */
  static view = null;

  /** @type {Map<string, CastSprite>} */
  static #sprites = new Map();

  /** @type {Backdrop|null} */
  static #backdrop = null;

  static #running = false;

  /** @type {{view: object|null, options: object}|null} */
  static #pending = null;

  /** Resolvers waiting for the queue to drain. */
  static #waiters = [];

  /* -------------------------------------------- */
  /*  Geometry                                    */
  /* -------------------------------------------- */

  /** The stage frame in world space for the current map. */
  static stageFrame() {
    const aspect = parseAspect(getSetting("stageAspect"));
    return computeFrame(canvas.dimensions.sceneRect, aspect);
  }

  /** The screen frame used by Cast-Only mode. */
  static screenFrame() {
    const { width, height } = Camera.screen();
    return { x: 0, y: 0, width, height };
  }

  static frameFor(view) {
    return view?.mode === "cast" ? this.screenFrame() : this.stageFrame();
  }

  /** The container cast sprites of a view belong in. */
  static #castContainer(view) {
    return view?.mode === "cast" ? canvas.immersiveOverlay?.cast : canvas.immersiveStage?.cast;
  }

  /** Look up the sprite of a cast entry. */
  static getSprite(entryId) {
    return this.#sprites.get(entryId) ?? null;
  }

  /* -------------------------------------------- */
  /*  Queue                                       */
  /* -------------------------------------------- */

  /**
   * Request a view to be shown.
   * @param {object|null} view
   * @param {object} [options]
   * @param {boolean} [options.animate=true]   Use transitions and animations
   * @param {"frame"|"restore"|null} [options.camera]  Camera move performed as part of the change
   * @param {object} [options.transition]      Override the transition ({type, duration})
   * @returns {Promise<void>} Resolves once the queue is idle
   */
  static request(view, options = {}) {
    // Merge camera intents if an earlier request has not run yet
    const camera = options.camera ?? this.#pending?.options.camera ?? null;
    this.#pending = { view, options: { ...this.#pending?.options, ...options, camera } };
    const idle = new Promise(resolve => this.#waiters.push(resolve));
    if ( !this.#running ) this.#drain();
    return idle;
  }

  static async #drain() {
    this.#running = true;
    try {
      while ( this.#pending ) {
        const { view, options } = this.#pending;
        this.#pending = null;
        try {
          await this.#apply(view, options);
        }
        catch(err) {
          console.error(`${MODULE_ID} | Failed to render immersive scene`, err);
        }
      }
    }
    finally {
      this.#running = false;
      const waiters = this.#waiters;
      this.#waiters = [];
      waiters.forEach(r => r());
    }
  }

  /* -------------------------------------------- */
  /*  Applying views                              */
  /* -------------------------------------------- */

  static async #apply(next, { animate = true, camera = null, transition } = {}) {
    if ( !canvas?.ready || !canvas.immersiveStage?.cast ) {
      this.view = next;
      return;
    }
    const prev = this.view;
    const diff = diffViews(prev, next);
    this.view = next;
    const motion = animate && !reducedMotion();

    // Full rebuilds happen behind a canvas transition
    if ( ["start", "stop", "scene"].includes(diff.kind) || diff.modeChanged ) {
      const settings = transition ?? (next ?? prev).transition;
      await this.#transition(async () => {
        await this.#build(next);
        if ( camera === "frame" ) await this.frameStage({ duration: 0 });
        else if ( camera === "restore" ) await Camera.restore();
      }, motion ? settings : null);
      if ( motion && next ) this.#playEntrances(next);
      return;
    }
    if ( diff.kind === "none" ) return;

    // Background change (sequence step or edit)
    if ( diff.backgroundChanged && next.mode !== "cast" ) {
      await this.#transition(() => this.#buildBackdrop(next), motion ? (transition ?? next.transition) : null);
    }

    const frame = this.frameFor(next);
    const container = this.#castContainer(next);
    const tasks = [];
    for ( const item of diff.removed ) {
      const sprite = this.#sprites.get(item.id);
      this.#sprites.delete(item.id);
      if ( sprite ) tasks.push(motion ? sprite.exit(next.entrance) : sprite.destroy({ children: true }));
    }
    for ( const item of diff.added ) {
      tasks.push((async () => {
        const sprite = await this.#createSprite(item, next.style, frame, container);
        if ( sprite && motion ) await sprite.enter(next.entrance);
      })());
    }
    for ( const item of diff.moved ) this.#sprites.get(item.id)?.place(item, frame, { animate: motion });
    for ( const item of diff.looks ) tasks.push(this.#sprites.get(item.id)?.setLook(item.src, { animate: motion }));
    for ( const item of diff.restyled ) this.#sprites.get(item.id)?.restyle(item);
    await Promise.allSettled(tasks);
  }

  /**
   * Instantly rebuild the current view, e.g. after the canvas was redrawn.
   * @returns {Promise<void>}
   */
  static async redraw(view = this.view) {
    this.#forgetObjects();
    this.view = null;
    return this.request(view, { animate: false });
  }

  /** Called when the canvas tears down: display objects are destroyed by their layers. */
  static onTearDown() {
    this.#forgetObjects();
    this.view = null;
    SceneMask.reset();
  }

  static #forgetObjects() {
    for ( const sprite of this.#sprites.values() ) if ( !sprite.destroyed ) sprite.destroy({ children: true });
    this.#sprites.clear();
    this.#backdrop?.clear();
    this.#backdrop = null;
  }

  /* -------------------------------------------- */

  /** Build everything for a view from scratch (no animation). */
  static async #build(view) {
    const sources = view ? [view.background?.src, ...view.items.map(i => i.src)] : [];
    await preloadTextures(sources.filter(s => s && !foundry.helpers.media.VideoHelper.hasVideoExtension(s)));
    this.#forgetObjects();
    if ( !view ) {
      SceneMask.restore();
      return;
    }
    if ( view.mode === "cast" ) SceneMask.restore();
    else {
      SceneMask.hide();
      await this.#buildBackdrop(view);
    }
    const frame = this.frameFor(view);
    const container = this.#castContainer(view);
    await Promise.allSettled(view.items.map(item => this.#createSprite(item, view.style, frame, container)));
  }

  static async #buildBackdrop(view) {
    const layer = canvas.immersiveStage;
    if ( !layer?.backdrop ) return;
    this.#backdrop ??= new Backdrop(layer.backdrop);
    await this.#backdrop.build(view.background, this.stageFrame(), canvas.dimensions.rect);
  }

  static async #createSprite(item, style, frame, container) {
    if ( !container || container.destroyed ) return null;
    const sprite = new CastSprite(item, style);
    this.#sprites.set(item.id, sprite);
    if ( this.#sprites.get(item.id) !== sprite ) return null;
    await sprite.init(frame);
    if ( sprite.destroyed || (this.#sprites.get(item.id) !== sprite) ) {
      if ( !sprite.destroyed ) sprite.destroy({ children: true });
      return null;
    }
    container.addChild(sprite);
    Hooks.callAll(`${MODULE_ID}.spriteCreated`, sprite);
    return sprite;
  }

  static #playEntrances(view) {
    for ( const item of view.items ) this.#sprites.get(item.id)?.enter(view.entrance);
  }

  /**
   * Run an operation behind a canvas transition (a snapshot of the screen dissolving into the result).
   * @param {Function} operation
   * @param {{type: string, duration: number}|null} settings   null to apply instantly
   */
  static async #transition(operation, settings) {
    const type = settings?.type;
    if ( !settings || !settings.duration || (type === "none") || (type === "cut") ) return operation();
    const transitionType = CONFIG.Canvas.sceneTransitions?.[type] ? type : "fade";
    let error = null;
    await canvas.transition.run({
      operation: async () => {
        try {
          await operation();
        }
        catch(err) {
          error = err;
        }
      },
      transitionType,
      duration: settings.duration,
      easing: foundry.canvas.animation.CanvasAnimation.easeInOutCosine
    });
    if ( error ) throw error;
  }

  /* -------------------------------------------- */
  /*  Camera helpers                              */
  /* -------------------------------------------- */

  /** Glide the camera so the whole stage frame is visible. */
  static async frameStage({ duration = 800 } = {}) {
    if ( !canvas?.ready ) return;
    await Camera.showShot(this.stageFrame(), { x: 0.5, y: 0.5, zoom: 1 }, { duration });
  }

  /** Re-layout cast-only sprites after the screen was resized. */
  static relayoutScreen() {
    if ( this.view?.mode !== "cast" ) return;
    const frame = this.screenFrame();
    for ( const item of this.view.items ) this.#sprites.get(item.id)?.place(item, frame, { animate: false });
  }

  /** Update video volume after a client setting change. */
  static refreshVolume() {
    this.#backdrop?.refreshVolume();
  }
}
