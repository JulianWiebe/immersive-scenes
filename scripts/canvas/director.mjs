/**
 * Decides what each client shows: the live broadcast, or (GM only) a local preview of a library
 * scene. Listens to live state, library and canvas changes and hands resulting views to the renderer.
 */
import { MODULE_ID } from "../constants.mjs";
import { getSetting } from "../settings.mjs";
import LibraryStore from "../data/library-store.mjs";
import { buildView } from "../utils/resolve.mjs";
import { normalizeLive } from "../utils/schema.mjs";
import { parseAspect } from "../utils/frame.mjs";
import StageRenderer from "./stage-renderer.mjs";
import Camera from "./camera.mjs";

export default class StageDirector {
  /** Local preview: {sceneId, step, mode} or null. */
  static #preview = null;

  /** Last live state seen by this client. */
  static #live = normalizeLive({});

  static #warnedBlank = false;

  /* -------------------------------------------- */

  /** The live state as stored in the world. */
  static get live() {
    return normalizeLive(getSetting("live"));
  }

  static get preview() {
    return this.#preview;
  }

  /** Whether this client currently shows a local preview instead of the broadcast. */
  static get isPreviewing() {
    return !!this.#preview;
  }

  /** Register hooks. Called once on `ready`. */
  static init() {
    this.#live = this.live;
    Hooks.on(`${MODULE_ID}.liveChanged`, () => this.#onLiveChanged());
    Hooks.on(`${MODULE_ID}.libraryChanged`, key => {
      if ( ["scenes", "characters"].includes(key) ) this.refresh();
    });
    Hooks.on(`${MODULE_ID}.displayChanged`, () => {
      StageRenderer.refreshVolume();
      this.refresh({ animate: false });
    });
    Hooks.on("canvasTearDown", () => StageRenderer.onTearDown());
    Hooks.on("canvasReady", () => this.#onCanvasReady());
    Hooks.on("updateActor", actor => {
      // Characters without looks fall back to their actor's image
      const linked = Object.values(LibraryStore.characters).some(c => c.actorUuid === actor.uuid && !c.looks.length);
      if ( linked ) this.refresh();
    });
    window.addEventListener("resize", foundry.utils.debounce(() => {
      if ( StageRenderer.view?.mode === "cast" ) this.refresh({ animate: false });
    }, 150));
    if ( canvas?.ready ) this.#onCanvasReady();
  }

  /* -------------------------------------------- */

  /**
   * The view this client should display right now.
   * @returns {object|null}
   */
  static computeView() {
    const source = this.#preview ?? (this.#live.active ? this.#live : null);
    if ( !source ) return null;
    const scene = LibraryStore.getScene(source.sceneId);
    if ( !scene ) return null;
    const mode = source.mode ?? scene.mode;
    const aspect = mode === "cast" ? screenAspect() : parseAspect(getSetting("stageAspect"));
    return buildView({
      scene,
      characters: LibraryStore.characters,
      step: source.step ?? 0,
      mode,
      aspect,
      fallbackImage: character => actorImage(character)
    });
  }

  /** Re-render the current view. */
  static refresh(options = {}) {
    return StageRenderer.request(this.computeView(), options);
  }

  /* -------------------------------------------- */
  /*  Preview                                     */
  /* -------------------------------------------- */

  /**
   * Show a library scene on this client only (GM composing tool).
   * @param {string} sceneId
   * @param {object} [options]
   * @param {number} [options.step=0]
   * @param {string|null} [options.mode]
   */
  static async startPreview(sceneId, { step = 0, mode = null } = {}) {
    const wasShowing = !!StageRenderer.view;
    if ( !wasShowing ) Camera.save();
    this.#preview = { sceneId, step, mode };
    Hooks.callAll(`${MODULE_ID}.previewChanged`, this.#preview);
    return this.refresh({ camera: wasShowing ? null : (getSetting("frameOnStart") ? "frame" : null) });
  }

  /** Update the previewed step or mode. */
  static updatePreview(changes) {
    if ( !this.#preview ) return;
    Object.assign(this.#preview, changes);
    Hooks.callAll(`${MODULE_ID}.previewChanged`, this.#preview);
    return this.refresh();
  }

  /** End the local preview and return to the broadcast (or the map). */
  static async stopPreview() {
    if ( !this.#preview ) return;
    this.#preview = null;
    Hooks.callAll(`${MODULE_ID}.previewChanged`, null);
    const returning = this.#live.active;
    return this.refresh({ camera: returning ? null : "restore" });
  }

  /* -------------------------------------------- */
  /*  Event handlers                              */
  /* -------------------------------------------- */

  static async #onLiveChanged() {
    const prev = this.#live;
    const next = this.live;
    this.#live = next;
    Hooks.callAll(`${MODULE_ID}.liveStateChanged`, next, prev);
    if ( !this.#checkCanvas(next) ) return;

    // A local preview takes precedence; the broadcast shows again when the preview ends.
    if ( this.#preview ) return;

    let camera = null;
    if ( next.active && !prev.active ) {
      Camera.save();
      if ( getSetting("frameOnStart") ) camera = "frame";
    }
    else if ( !next.active && prev.active ) camera = "restore";

    await this.refresh({ camera, transition: next.transition ?? undefined });

    // Theater camera cut
    if ( next.active && next.shot && (next.shot.nonce !== prev.shot?.nonce) ) this.#cutToShot(next);
  }

  static async #onCanvasReady() {
    Camera.forget();
    const view = this.computeView();
    if ( view ) Camera.save();
    await StageRenderer.redraw(view);
    if ( view && getSetting("frameOnStart") && view.mode !== "cast" ) StageRenderer.frameStage({ duration: 0 });
  }

  static #cutToShot(live) {
    const scene = LibraryStore.getScene(live.sceneId);
    const shot = scene?.shots.find(s => s.id === live.shot.id);
    if ( !shot || (StageRenderer.view?.mode === "cast") ) return;
    Camera.showShot(StageRenderer.stageFrame(), shot, { duration: shot.duration, easing: shot.easing });
  }

  /** Warn a GM once when a broadcast runs while no map is viewed (nothing can be drawn). */
  static #checkCanvas(live) {
    if ( canvas?.ready ) return true;
    if ( live.active && game.user.isGM && !this.#warnedBlank ) {
      this.#warnedBlank = true;
      ui.notifications.warn("IMMERSIVE_SCENES.Warnings.NoCanvas", { localize: true });
    }
    return false;
  }
}

function screenAspect() {
  const { width, height } = Camera.screen();
  return width / Math.max(1, height);
}

function actorImage(character) {
  if ( !character.actorUuid ) return "";
  const actor = fromUuidSync(character.actorUuid, { strict: false });
  return actor?.img ?? "";
}
