/**
 * The GM Live Dock: run the show without leaving the table. Switch scenes, change the display
 * mode, step through background sequences, edit the cast and their looks, cut between camera
 * shots and drive slideshows. When a local preview is active, the dock controls the preview.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import StageDirector, { findShot } from "../canvas/director.mjs";
import StageRenderer from "../canvas/stage-renderer.mjs";
import Camera from "../canvas/camera.mjs";
import CanvasEditing from "../canvas/canvas-editing.mjs";
import { setCurrentLook, toggleCastEntry, restackCastEntry } from "../data/scene-ops.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { viewToShot } from "../utils/frame.mjs";
import { randomId } from "../utils/ids.mjs";
import { t, sceneThumb, isVideoPath, getDragData } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class LiveDock extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "immersive-live-dock",
    classes: ["immersive-scenes", "live-dock"],
    window: { title: "IMMERSIVE_SCENES.Dock.Title", icon: "fa-solid fa-sliders", resizable: true },
    position: { width: 360, height: 680, top: 80, left: 120 },
    actions: {
      broadcastSelected: LiveDock.#onBroadcastSelected,
      previewSelected: LiveDock.#onPreviewSelected,
      stop: LiveDock.#onStop,
      endPreview: LiveDock.#onEndPreview,
      promotePreview: LiveDock.#onPromotePreview,
      setMode: LiveDock.#onSetMode,
      setStep: LiveDock.#onSetStep,
      stepDelta: LiveDock.#onStepDelta,
      setLook: LiveDock.#onSetLook,
      toggleEntry: LiveDock.#onToggleEntry,
      restack: LiveDock.#onRestack,
      removeEntry: LiveDock.#onRemoveEntry,
      addCast: LiveDock.#onAddCast,
      toggleEdit: LiveDock.#onToggleEdit,
      cut: LiveDock.#onCut,
      captureShot: LiveDock.#onCaptureShot,
      editScene: LiveDock.#onEditScene,
      deckPlay: LiveDock.#onDeckPlay,
      deckPause: LiveDock.#onDeckPause,
      deckNext: LiveDock.#onDeckNext,
      deckPrev: LiveDock.#onDeckPrev,
      deckStop: LiveDock.#onDeckStop
    }
  };

  static PARTS = {
    dock: { template: template("apps/live-dock.hbs"), scrollable: [".dock-body"] }
  };

  /** Scene selected in the picker (not yet shown). */
  #selected = null;

  /** Transition override for the next scene change ("" = scene default). */
  #transition = "";

  #hookIds = [];

  /** What the dock controls: the local preview if any, else the live broadcast. */
  get target() {
    const preview = StageDirector.preview;
    if ( preview ) return { kind: "preview", sceneId: preview.sceneId, step: preview.step ?? 0, mode: preview.mode };
    const live = StageDirector.live;
    if ( live.active ) return { kind: "live", sceneId: live.sceneId, step: live.step, mode: live.mode, deck: live.deck };
    return null;
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const target = this.target;
    const scene = target ? LibraryStore.getScene(target.sceneId) : null;
    const scenes = LibraryStore.list("scenes");
    this.#selected ??= scene?.id ?? scenes[0]?.id ?? null;
    const mode = target?.mode ?? scene?.mode;
    const characters = LibraryStore.characters;

    context.target = target;
    context.isLive = target?.kind === "live";
    context.isPreview = target?.kind === "preview";
    context.scene = scene;
    context.editing = CanvasEditing.enabled;
    context.sceneOptions = Object.fromEntries(scenes.map(s => [s.id, s.name]));
    context.selected = this.#selected;
    context.transitionOptions = {
      "": t("Dock.SceneTransition"),
      none: t("Transition.None"),
      ...Object.fromEntries(Object.values(CONFIG.Canvas.sceneTransitions ?? {}).map(tr => [tr.id, game.i18n.localize(tr.label)]))
    };
    context.transition = this.#transition;
    if ( !scene ) return context;

    context.modes = ["hero", "token", "cast"].map(m => ({
      id: m, label: t(`Mode.${m}`), active: m === mode,
      icon: { hero: "fa-solid fa-person", token: "fa-solid fa-circle-user", cast: "fa-solid fa-layer-group" }[m]
    }));
    context.steps = scene.backgrounds.map((b, i) => ({
      index: i, number: i + 1, src: b.src, isVideo: isVideoPath(b.src), active: i === target.step, name: b.name || `${i + 1}`
    }));
    context.cast = scene.cast.map(entry => {
      const character = characters[entry.characterId];
      const active = resolveLook(character, entry.lookId);
      return {
        id: entry.id,
        name: entry.label || character?.name || "?",
        hidden: entry.hidden,
        mirror: entry.mirror,
        pinned: !!entry.lookId,
        looks: (character?.looks ?? []).map(l => {
          const src = lookImage(l, "token");
          return { id: l.id, name: l.name, src, isVideo: isVideoPath(src), active: l.id === active?.id };
        })
      };
    });
    context.addableCharacters = Object.fromEntries(LibraryStore.list("characters").map(c => [c.id, c.name]));
    context.shots = scene.shots.map(s => ({ id: s.id, name: s.name }));
    context.showShots = mode !== "cast";

    const deck = target.deck ? LibraryStore.getDeck(target.deck.id) : null;
    if ( deck ) {
      context.deck = {
        name: deck.name,
        index: target.deck.index + 1,
        count: deck.items.length,
        playing: target.deck.playing
      };
    }
    context.thumb = sceneThumb(scene);
    return context;
  }

  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = () => this.render();
    this.#hookIds = [
      `${MODULE_ID}.libraryChanged`, `${MODULE_ID}.liveStateChanged`,
      `${MODULE_ID}.previewChanged`, `${MODULE_ID}.editModeChanged`
    ].map(name => [name, Hooks.on(name, rerender)]);
  }

  _onClose(options) {
    super._onClose(options);
    for ( const [name, id] of this.#hookIds ) Hooks.off(name, id);
    this.#hookIds = [];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    html.querySelector("select[name=scene]")?.addEventListener("change", event => {
      this.#selected = event.currentTarget.value;
    });
    html.querySelector("select[name=transition]")?.addEventListener("change", event => {
      this.#transition = event.currentTarget.value;
    });
    const body = html.querySelector(".dock-body");
    body?.addEventListener("dragover", event => event.preventDefault());
    body?.addEventListener("drop", event => this.#onDrop(event));
  }

  async #onDrop(event) {
    event.preventDefault();
    const data = getDragData(event);
    const target = this.target;
    if ( !data ) return;
    if ( data.type === `${MODULE_ID}.scenes` ) {
      this.#selected = data.id;
      return LiveController.broadcast(data.id, { transition: this.#transitionOverride() });
    }
    if ( !target ) return;
    let characterId = null;
    if ( data.type === `${MODULE_ID}.characters` ) characterId = data.id;
    else if ( data.type === "Actor" ) {
      const actor = await fromUuid(data.uuid);
      if ( actor && !actor.pack ) characterId = (await LibraryStore.createCharacterFromActor(actor)).id;
    }
    if ( characterId ) await LibraryStore.addToCast(target.sceneId, characterId);
  }

  #transitionOverride() {
    if ( !this.#transition ) return null;
    const duration = CONFIG.Canvas.sceneTransitions?.[this.#transition]?.defaultDuration ?? 1000;
    return { type: this.#transition, duration };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onBroadcastSelected() {
    if ( !this.#selected ) return;
    if ( StageDirector.isPreviewing ) await StageDirector.stopPreview();
    return LiveController.broadcast(this.#selected, { transition: this.#transitionOverride() });
  }

  static #onPreviewSelected() {
    if ( this.#selected ) return StageDirector.startPreview(this.#selected);
  }

  static #onStop() {
    return LiveController.stop({ transition: this.#transitionOverride() });
  }

  static #onEndPreview() {
    return StageDirector.stopPreview();
  }

  /** Broadcast what is being previewed. */
  static async #onPromotePreview() {
    const preview = StageDirector.preview;
    if ( !preview ) return;
    await StageDirector.stopPreview();
    return LiveController.broadcast(preview.sceneId, {
      step: preview.step, mode: preview.mode, transition: this.#transitionOverride()
    });
  }

  static #onSetMode(event, target) {
    const mode = target.dataset.mode;
    const scene = LibraryStore.getScene(this.target?.sceneId);
    const value = mode === scene?.mode ? null : mode;
    if ( this.target?.kind === "preview" ) return StageDirector.updatePreview({ mode: value });
    return LiveController.setMode(value);
  }

  static #onSetStep(event, target) {
    return this.#setStep(Number(target.dataset.index));
  }

  static #onStepDelta(event, target) {
    return this.#setStep((this.target?.step ?? 0) + Number(target.dataset.delta));
  }

  #setStep(step) {
    const target = this.target;
    if ( !target ) return;
    const count = LibraryStore.getScene(target.sceneId)?.backgrounds.length ?? 0;
    if ( !count ) return;
    const wrapped = ((step % count) + count) % count;
    if ( target.kind === "preview" ) return StageDirector.updatePreview({ step: wrapped });
    return LiveController.setStep(wrapped);
  }

  static async #onSetLook(event, button) {
    const entryId = button.closest("[data-entry-id]").dataset.entryId;
    const sceneId = this.target?.sceneId;
    const entry = LibraryStore.getScene(sceneId)?.cast.find(e => e.id === entryId);
    if ( !entry ) return;
    const lookId = button.dataset.lookId;
    if ( entry.lookId ) await LibraryStore.updateCastEntry(sceneId, entryId, { lookId });
    else await setCurrentLook(entry.characterId, lookId);
    Hooks.callAll(`${MODULE_ID}.lookChanged`, entry.characterId, lookId, game.user);
  }

  static #onToggleEntry(event, button) {
    const entryId = button.closest("[data-entry-id]").dataset.entryId;
    return toggleCastEntry(this.target.sceneId, entryId, button.dataset.field);
  }

  static #onRestack(event, button) {
    const entryId = button.closest("[data-entry-id]").dataset.entryId;
    return restackCastEntry(this.target.sceneId, entryId, Number(button.dataset.direction));
  }

  static #onRemoveEntry(event, button) {
    const entryId = button.closest("[data-entry-id]").dataset.entryId;
    return LibraryStore.removeCastEntry(this.target.sceneId, entryId);
  }

  static #onAddCast() {
    const characterId = this.element.querySelector("select[name=addCharacter]")?.value;
    if ( characterId && this.target ) return LibraryStore.addToCast(this.target.sceneId, characterId);
  }

  static #onToggleEdit() {
    CanvasEditing.toggle();
  }

  static async #onCut(event, button) {
    const shotId = button.dataset.shotId;
    const target = this.target;
    if ( !target ) return;
    if ( target.kind === "live" ) return LiveController.cutTo(shotId);
    const shot = findShot(target.sceneId, shotId);
    if ( shot ) await Camera.showShot(StageRenderer.stageFrame(), shot, { duration: shot.duration, easing: shot.easing });
  }

  static async #onCaptureShot() {
    const target = this.target;
    if ( !target || !canvas?.ready ) return;
    const shot = viewToShot(StageRenderer.stageFrame(), Camera.current(), Camera.screen());
    const round = v => Math.round(v * 1000) / 1000;
    await LibraryStore.update("scenes", target.sceneId, scene => {
      scene.shots.push({
        id: randomId(), name: `${t("SceneEditor.Shot")} ${scene.shots.length + 1}`,
        x: round(shot.x), y: round(shot.y), zoom: round(shot.zoom)
      });
    });
  }

  static #onEditScene() {
    const sceneId = this.target?.sceneId ?? this.#selected;
    if ( sceneId ) game.modules.get(MODULE_ID).api.editScene(sceneId);
  }

  static #onDeckPlay() {
    return game.modules.get(MODULE_ID).api.resumeDeck?.();
  }

  static #onDeckPause() {
    return game.modules.get(MODULE_ID).api.pauseDeck?.();
  }

  static #onDeckNext() {
    return game.modules.get(MODULE_ID).api.nextSlide?.();
  }

  static #onDeckPrev() {
    return game.modules.get(MODULE_ID).api.prevSlide?.();
  }

  static #onDeckStop() {
    return game.modules.get(MODULE_ID).api.stopDeck?.();
  }
}

/** Open (or focus) the live dock. */
export function openDock() {
  const existing = foundry.applications.instances.get("immersive-live-dock");
  if ( existing ) {
    existing.bringToFront();
    return existing;
  }
  const dock = new LiveDock();
  dock.render({ force: true });
  return dock;
}

/** Toggle the live dock. */
export function toggleDock() {
  const existing = foundry.applications.instances.get("immersive-live-dock");
  if ( existing ) return existing.close();
  return openDock();
}
