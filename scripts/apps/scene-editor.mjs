/**
 * Editor for a library scene: general settings, background sequence, cast, layout, camera shots
 * and transitions. Every change is saved immediately, so editing the live scene updates the
 * broadcast for everyone in real time.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import StageDirector from "../canvas/director.mjs";
import StageRenderer from "../canvas/stage-renderer.mjs";
import Camera from "../canvas/camera.mjs";
import { viewToShot } from "../utils/frame.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { randomId } from "../utils/ids.mjs";
import { freezeLayout } from "../data/scene-ops.mjs";
import { t, getDragData, indexedToArray, isVideoPath, pickFile } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const EASINGS = ["easeInOutCosine", "easeOutCircle", "easeInCircle"];

export default class SceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ sceneId, ...options } = {}) {
    super({ id: `immersive-scene-editor-${sceneId}`, ...options });
    this.sceneId = sceneId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["immersive-scenes", "scene-editor"],
    tag: "form",
    window: { icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 660, height: 740 },
    form: { handler: SceneEditor.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      preview: SceneEditor.#onPreview,
      endPreview: SceneEditor.#onEndPreview,
      broadcast: SceneEditor.#onBroadcast,
      addBackground: SceneEditor.#onAddBackground,
      removeBackground: SceneEditor.#onRemoveBackground,
      moveBackground: SceneEditor.#onMoveBackground,
      showStep: SceneEditor.#onShowStep,
      addCast: SceneEditor.#onAddCast,
      removeCast: SceneEditor.#onRemoveCast,
      moveCast: SceneEditor.#onMoveCast,
      freezeLayout: SceneEditor.#onFreezeLayout,
      addShot: SceneEditor.#onAddShot,
      captureShot: SceneEditor.#onCaptureShot,
      showShot: SceneEditor.#onShowShot,
      removeShot: SceneEditor.#onRemoveShot,
      pickThumb: SceneEditor.#onPickThumb
    }
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    general: { template: template("apps/scene-editor/general.hbs") },
    backgrounds: { template: template("apps/scene-editor/backgrounds.hbs"), scrollable: [""] },
    cast: { template: template("apps/scene-editor/cast.hbs"), scrollable: [""] },
    layout: { template: template("apps/scene-editor/layout.hbs") },
    camera: { template: template("apps/scene-editor/camera.hbs"), scrollable: [""] },
    transition: { template: template("apps/scene-editor/transition.hbs") },
    footer: { template: template("apps/scene-editor/footer.hbs") }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "general", icon: "fa-solid fa-sliders" },
        { id: "backgrounds", icon: "fa-solid fa-images" },
        { id: "cast", icon: "fa-solid fa-users" },
        { id: "layout", icon: "fa-solid fa-table-cells-large" },
        { id: "camera", icon: "fa-solid fa-video" },
        { id: "transition", icon: "fa-solid fa-wand-magic-sparkles" }
      ],
      initial: "general",
      labelPrefix: "IMMERSIVE_SCENES.SceneEditor.Tabs"
    }
  };

  /** @type {string} */
  sceneId;

  #hookIds = [];

  get scene() {
    return LibraryStore.getScene(this.sceneId);
  }

  get title() {
    return `${t("SceneEditor.Title")}: ${this.scene?.name ?? ""}`;
  }

  /** Whether this scene is currently shown on this client (live or previewed). */
  get isShown() {
    return StageRenderer.view?.sceneId === this.sceneId;
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const scene = this.scene;
    if ( !scene ) return context;
    const live = StageDirector.live;
    const isLive = live.active && live.sceneId === scene.id;
    const preview = StageDirector.preview;
    const isPreview = preview?.sceneId === scene.id;
    const activeStep = isPreview ? preview.step : (isLive ? live.step : -1);
    const characters = LibraryStore.characters;

    const folders = LibraryStore.list("folders").filter(f => f.type === "scene");
    const transitionTypes = Object.fromEntries([
      ["none", t("Transition.None")],
      ...Object.values(CONFIG.Canvas.sceneTransitions ?? {}).map(tr => [tr.id, game.i18n.localize(tr.label)])
    ]);
    const freeform = ["free", "theater"].includes(scene.layout.type);

    Object.assign(context, {
      scene,
      isLive,
      isPreview,
      canControl: LiveController.canControl,
      folderOptions: { "": t("Fields.NoFolder"), ...Object.fromEntries(folders.map(f => [f.id, f.name])) },
      modeOptions: Object.fromEntries(["hero", "token", "cast"].map(m => [m, t(`Mode.${m}`)])),
      castStyleOptions: { hero: t("Mode.hero"), token: t("Mode.token") },
      fitOptions: Object.fromEntries(["cover", "contain", "stretch"].map(f => [f, t(`Fit.${f}`)])),
      layoutOptions: Object.fromEntries(["row", "column", "grid", "free", "theater"].map(l => [l, t(`Layout.${l}`)])),
      anchorOptions: Object.fromEntries(["bottom", "top", "center", "left", "right"].map(a => [a, t(`Anchor.${a}`)])),
      entranceOptions: Object.fromEntries(["fade", "slide", "rise", "zoom", "none"].map(e => [e, t(`Entrance.${e}`)])),
      easingOptions: Object.fromEntries(EASINGS.map(e => [e, t(`Easing.${e}`)])),
      transitionTypes,
      freeform,
      isCastMode: scene.mode === "cast",
      backgrounds: scene.backgrounds.map((b, i) => ({
        ...b, index: i, number: i + 1, isVideo: isVideoPath(b.src), active: i === activeStep,
        first: i === 0, last: i === scene.backgrounds.length - 1
      })),
      cast: scene.cast.map((e, i) => {
        const character = characters[e.characterId];
        const look = resolveLook(character, e.lookId);
        const thumb = lookImage(look, "token");
        return {
          ...e, index: i, first: i === 0, last: i === scene.cast.length - 1,
          name: character?.name ?? t("SceneEditor.MissingCharacter"),
          thumb, isVideo: isVideoPath(thumb),
          lookOptions: {
            "": t("SceneEditor.CurrentLook"),
            ...Object.fromEntries((character?.looks ?? []).map(l => [l.id, l.name]))
          }
        };
      }),
      addableCharacters: Object.fromEntries(LibraryStore.list("characters").map(c => [c.id, c.name])),
      shots: scene.shots.map((s, i) => ({ ...s, index: i })),
      thumbIsVideo: isVideoPath(scene.thumb)
    });
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = () => {
      if ( !this.scene ) return this.close();
      this.render();
    };
    this.#hookIds = [
      [`${MODULE_ID}.libraryChanged`, Hooks.on(`${MODULE_ID}.libraryChanged`, key => {
        if ( ["scenes", "characters", "folders"].includes(key) ) rerender();
      })],
      [`${MODULE_ID}.liveStateChanged`, Hooks.on(`${MODULE_ID}.liveStateChanged`, rerender)],
      [`${MODULE_ID}.previewChanged`, Hooks.on(`${MODULE_ID}.previewChanged`, rerender)]
    ];
  }

  _onClose(options) {
    super._onClose(options);
    for ( const [name, id] of this.#hookIds ) Hooks.off(name, id);
    this.#hookIds = [];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Drop characters (from the library tab) or actors onto the cast list
    const zone = this.element.querySelector(".cast-drop");
    if ( zone ) {
      zone.addEventListener("dragover", event => event.preventDefault());
      zone.addEventListener("drop", event => this.#onDropCast(event));
    }
  }

  async #onDropCast(event) {
    event.preventDefault();
    const data = getDragData(event);
    if ( !data ) return;
    let characterId = null;
    if ( data.type === `${MODULE_ID}.characters` ) characterId = data.id;
    else if ( data.type === "Actor" ) {
      const actor = await fromUuid(data.uuid);
      if ( !actor || actor.pack ) return;
      characterId = (await LibraryStore.createCharacterFromActor(actor)).id;
    }
    if ( characterId ) await LibraryStore.addToCast(this.sceneId, characterId);
  }

  /* -------------------------------------------- */
  /*  Form                                        */
  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const scene = this.scene;
    if ( !scene ) return;
    const data = foundry.utils.expandObject(formData.object);
    const byId = (list, id) => list.find(x => x.id === id) ?? {};
    const record = {
      ...scene,
      name: data.name ?? scene.name,
      tags: Array.isArray(data.tags) ? data.tags : scene.tags,
      folder: data.folder || null,
      mode: data.mode ?? scene.mode,
      castStyle: data.castStyle ?? scene.castStyle,
      thumb: data.thumb ?? scene.thumb,
      notes: data.notes ?? scene.notes,
      backgrounds: data.backgrounds
        ? indexedToArray(data.backgrounds).map(b => ({ ...byId(scene.backgrounds, b.id), ...b }))
        : scene.backgrounds,
      cast: data.cast
        ? indexedToArray(data.cast).map(e => ({ ...byId(scene.cast, e.id), ...e, lookId: e.lookId || null }))
        : scene.cast,
      layout: { ...scene.layout, ...data.layout },
      shots: data.shots ? indexedToArray(data.shots).map(s => ({ ...byId(scene.shots, s.id), ...s })) : scene.shots,
      transition: { ...scene.transition, ...data.transition },
      entrance: { ...scene.entrance, ...data.entrance }
    };
    await LibraryStore.update("scenes", scene.id, current => Object.assign(current, record));
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  #edit(fn) {
    return LibraryStore.update("scenes", this.sceneId, fn);
  }

  static #onPreview() {
    return StageDirector.startPreview(this.sceneId);
  }

  static #onEndPreview() {
    return StageDirector.stopPreview();
  }

  static async #onBroadcast() {
    if ( StageDirector.preview?.sceneId === this.sceneId ) await StageDirector.stopPreview();
    return LiveController.broadcast(this.sceneId);
  }

  static async #onAddBackground() {
    const src = await pickFile({ type: "imagevideo" });
    if ( !src ) return;
    await this.#edit(scene => {
      scene.backgrounds.push({ id: randomId(), src, name: "" });
    });
  }

  static async #onRemoveBackground(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    await this.#edit(scene => {
      scene.backgrounds.splice(index, 1);
    });
  }

  static async #onMoveBackground(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const delta = Number(target.dataset.delta);
    await this.#edit(scene => moveItem(scene.backgrounds, index, delta));
  }

  /** Show a background step on the broadcast (if live) or in the local preview. */
  static async #onShowStep(event, target) {
    const step = Number(target.closest("[data-index]").dataset.index);
    const live = StageDirector.live;
    if ( StageDirector.preview?.sceneId === this.sceneId ) return StageDirector.updatePreview({ step });
    if ( live.active && live.sceneId === this.sceneId ) return LiveController.setStep(step);
    return StageDirector.startPreview(this.sceneId, { step });
  }

  static async #onAddCast() {
    const select = this.element.querySelector("select[name=addCharacter]");
    const characterId = select?.value;
    if ( characterId ) await LibraryStore.addToCast(this.sceneId, characterId);
  }

  static async #onRemoveCast(event, target) {
    const entryId = target.closest("[data-entry-id]").dataset.entryId;
    await LibraryStore.removeCastEntry(this.sceneId, entryId);
  }

  static async #onMoveCast(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const delta = Number(target.dataset.delta);
    await this.#edit(scene => moveItem(scene.cast, index, delta));
  }

  /** Switch a slot layout to freeform, keeping everybody where they currently stand. */
  static async #onFreezeLayout() {
    await this.#edit(scene => freezeLayout(scene, "free"));
  }

  static async #onAddShot() {
    const shot = this.#currentShot() ?? { x: 0.5, y: 0.5, zoom: 1 };
    await this.#edit(scene => {
      scene.shots.push({ id: randomId(), name: `${t("SceneEditor.Shot")} ${scene.shots.length + 1}`, ...shot });
    });
  }

  static async #onCaptureShot(event, target) {
    const shotId = target.closest("[data-shot-id]").dataset.shotId;
    const shot = this.#currentShot();
    if ( !shot ) return ui.notifications.warn("IMMERSIVE_SCENES.Warnings.ShowSceneFirst", { localize: true });
    await this.#edit(scene => {
      const s = scene.shots.find(x => x.id === shotId);
      if ( s ) Object.assign(s, shot);
    });
  }

  /** Cut to a shot: for everyone if this scene is live, otherwise only on this client. */
  static async #onShowShot(event, target) {
    const shotId = target.closest("[data-shot-id]").dataset.shotId;
    const live = StageDirector.live;
    if ( live.active && live.sceneId === this.sceneId && !StageDirector.isPreviewing ) return LiveController.cutTo(shotId);
    if ( !this.isShown ) await StageDirector.startPreview(this.sceneId);
    const shot = this.scene.shots.find(s => s.id === shotId);
    if ( shot ) await Camera.showShot(StageRenderer.stageFrame(), shot, { duration: shot.duration, easing: shot.easing });
  }

  static async #onRemoveShot(event, target) {
    const shotId = target.closest("[data-shot-id]").dataset.shotId;
    await this.#edit(scene => {
      scene.shots = scene.shots.filter(s => s.id !== shotId);
    });
  }

  static async #onPickThumb() {
    const src = await pickFile({ type: "imagevideo", current: this.scene.thumb });
    if ( src ) await this.#edit(scene => {
      scene.thumb = src;
    });
  }

  /** The current camera view as a shot, if the scene is visible on this client. */
  #currentShot() {
    if ( !canvas?.ready || !this.isShown ) return null;
    const shot = viewToShot(StageRenderer.stageFrame(), Camera.current(), Camera.screen());
    const round = v => Math.round(v * 1000) / 1000;
    return { x: round(shot.x), y: round(shot.y), zoom: round(shot.zoom) };
  }
}

/** Move an array item by delta positions (in place). */
function moveItem(list, index, delta) {
  const target = index + delta;
  if ( (target < 0) || (target >= list.length) ) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
}
