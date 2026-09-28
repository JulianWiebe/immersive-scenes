/**
 * GM editing directly on the canvas: drag cast members around, Shift+wheel to scale them,
 * right-click for the look palette. While dragging, other clients see a live preview through the
 * module socket; the final position is written to the library on release.
 */
import { MODULE_ID, SOCKET } from "../constants.mjs";
import StageRenderer from "./stage-renderer.mjs";
import CastSprite from "./cast-sprite.mjs";
import { moveCastEntry, scaleCastEntry } from "../data/scene-ops.mjs";
import { openLookPalette, closeLookPalette } from "../apps/look-palette.mjs";
import { canWriteLibrary } from "../data/permissions.mjs";

export default class CanvasEditing {
  static #enabled = false;

  static get enabled() {
    return this.#enabled;
  }

  /** Register hooks and listeners. Called once on `ready`. */
  static init() {
    Hooks.on(`${MODULE_ID}.spriteCreated`, sprite => this.#configure(sprite));
    game.socket.on(SOCKET, message => this.#onSocket(message));
    canvas.app?.view?.addEventListener("wheel", event => this.#onWheel(event), { capture: true, passive: false });
  }

  /**
   * Enable or disable editing on this client (GM only).
   * @param {boolean} [enabled]
   */
  static toggle(enabled = !this.#enabled) {
    this.#enabled = enabled && canWriteLibrary();
    closeLookPalette();
    for ( const sprite of this.#sprites() ) this.#configure(sprite);
    Hooks.callAll(`${MODULE_ID}.editModeChanged`, this.#enabled);
    return this.#enabled;
  }

  static *#sprites() {
    for ( const layer of [canvas.immersiveStage, canvas.immersiveOverlay] ) {
      for ( const child of layer?.cast?.children ?? [] ) if ( child instanceof CastSprite ) yield child;
    }
  }

  /* -------------------------------------------- */

  static #configure(sprite) {
    sprite.removeAllListeners("pointerdown");
    sprite.removeAllListeners("rightclick");
    if ( !this.#enabled ) {
      sprite.eventMode = "none";
      sprite.cursor = null;
      return;
    }
    sprite.eventMode = "static";
    sprite.cursor = "grab";
    sprite.on("pointerdown", event => this.#onPointerDown(event, sprite));
    sprite.on("rightclick", event => {
      const view = StageRenderer.view;
      if ( !view ) return;
      openLookPalette({ sceneId: view.sceneId, entryId: sprite.item.id, position: { x: event.clientX, y: event.clientY } });
    });
  }

  static #onPointerDown(event, sprite) {
    if ( event.button !== 0 ) return;
    event.stopPropagation();
    closeLookPalette();
    const view = StageRenderer.view;
    if ( !view ) return;
    const parent = sprite.parent;
    const start = event.getLocalPosition(parent);
    const origin = { x: sprite.x, y: sprite.y };
    const frame = StageRenderer.frameFor(view);
    sprite.cursor = "grabbing";
    sprite.alpha = 0.85;
    let last = 0;

    const onMove = ev => {
      const p = ev.getLocalPosition(parent);
      sprite.position.set(origin.x + (p.x - start.x), origin.y + (p.y - start.y));
      const now = Date.now();
      if ( now - last > 60 ) {
        last = now;
        game.socket.emit(SOCKET, {
          type: "dragPreview", sceneId: view.sceneId, entryId: sprite.item.id,
          dx: (sprite.x - origin.x) / frame.width, dy: (sprite.y - origin.y) / frame.height
        });
      }
    };
    const onUp = async () => {
      window.removeEventListener("pointerup", onUp);
      if ( sprite.destroyed ) return;
      sprite.off("globalpointermove", onMove);
      sprite.cursor = "grab";
      sprite.alpha = 1;
      const dx = (sprite.x - origin.x) / frame.width;
      const dy = (sprite.y - origin.y) / frame.height;
      if ( Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 ) return;
      await moveCastEntry(view.sceneId, sprite.item.id, { dx, dy });
    };
    sprite.on("globalpointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  static #onWheel(event) {
    if ( !this.#enabled || !event.shiftKey ) return;
    const view = StageRenderer.view;
    if ( !view ) return;
    const rect = canvas.app.view.getBoundingClientRect();
    const hit = canvas.app.renderer.events.rootBoundary.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    let sprite = hit;
    while ( sprite && !(sprite instanceof CastSprite) ) sprite = sprite.parent;
    if ( !sprite ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const delta = event.deltaY || event.deltaX;
    const factor = delta < 0 ? 1.05 : 1 / 1.05;
    this.#queueScale(view.sceneId, sprite.item.id, factor);
  }

  /** Accumulate wheel steps and commit them together. */
  static #scaleQueue = new Map();

  static #queueScale(sceneId, entryId, factor) {
    const key = `${sceneId}.${entryId}`;
    const pending = this.#scaleQueue.get(key) ?? { factor: 1, timer: null };
    pending.factor *= factor;
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this.#scaleQueue.delete(key);
      scaleCastEntry(sceneId, entryId, pending.factor);
    }, 180);
    this.#scaleQueue.set(key, pending);
  }

  /* -------------------------------------------- */

  static #onSocket(message) {
    if ( message?.type !== "dragPreview" ) return;
    const view = StageRenderer.view;
    if ( view?.sceneId !== message.sceneId ) return;
    const item = view.items.find(i => i.id === message.entryId);
    const sprite = StageRenderer.getSprite(message.entryId);
    if ( !item || !sprite ) return;
    sprite.place({ ...item, x: item.x + message.dx, y: item.y + message.dy }, StageRenderer.frameFor(view), { animate: false });
  }
}
