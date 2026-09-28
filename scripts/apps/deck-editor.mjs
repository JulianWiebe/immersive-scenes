/**
 * Editor for a slideshow: an ordered list of scenes (and background steps) that advance
 * automatically after their duration.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import { randomId } from "../utils/ids.mjs";
import { t, indexedToArray, sceneThumb, isVideoPath } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class DeckEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ deckId, ...options } = {}) {
    super({ id: `immersive-deck-editor-${deckId}`, ...options });
    this.deckId = deckId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["immersive-scenes", "deck-editor"],
    tag: "form",
    window: { icon: "fa-solid fa-film", resizable: true },
    position: { width: 560, height: 640 },
    form: { handler: DeckEditor.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      addItem: DeckEditor.#onAddItem,
      removeItem: DeckEditor.#onRemoveItem,
      moveItem: DeckEditor.#onMoveItem,
      play: DeckEditor.#onPlay
    }
  };

  static PARTS = {
    form: { template: template("apps/deck-editor.hbs"), scrollable: [".row-list"] }
  };

  deckId;

  #hookId = null;

  get deck() {
    return LibraryStore.getDeck(this.deckId);
  }

  get title() {
    return `${t("DeckEditor.Title")}: ${this.deck?.name ?? ""}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const deck = this.deck;
    if ( !deck ) return context;
    const scenes = LibraryStore.scenes;
    const folders = LibraryStore.list("folders").filter(f => f.type === "deck");
    const sceneOptions = Object.fromEntries(LibraryStore.list("scenes").map(s => [s.id, s.name]));
    const transitionTypes = Object.fromEntries([
      ["", t("DeckEditor.SceneTransitions")],
      ["none", t("Transition.None")],
      ...Object.values(CONFIG.Canvas.sceneTransitions ?? {}).map(tr => [tr.id, game.i18n.localize(tr.label)])
    ]);
    Object.assign(context, {
      deck,
      folderOptions: { "": t("Fields.NoFolder"), ...Object.fromEntries(folders.map(f => [f.id, f.name])) },
      sceneOptions,
      transitionTypes,
      transitionType: deck.transition?.type ?? "",
      transitionDuration: deck.transition?.duration ?? 1000,
      items: deck.items.map((item, i) => {
        const scene = scenes[item.sceneId];
        const thumb = scene ? (scene.backgrounds[item.step]?.src || sceneThumb(scene)) : "";
        return {
          ...item, index: i, number: i + 1, first: i === 0, last: i === deck.items.length - 1,
          thumb, isVideo: isVideoPath(thumb), missing: !scene,
          stepOptions: Object.fromEntries((scene?.backgrounds ?? []).map((b, s) => [s, b.name || `${t("DeckEditor.Step")} ${s + 1}`]))
        };
      }),
      canControl: LiveController.canControl
    });
    return context;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#hookId = Hooks.on(`${MODULE_ID}.libraryChanged`, key => {
      if ( !this.deck ) return this.close();
      if ( ["decks", "scenes", "folders"].includes(key) ) this.render();
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // The "add" picker is not part of the deck data: keep it from submitting the form
    this.element.querySelector("select[name=addScene]")?.addEventListener("change", e => e.stopPropagation());
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off(`${MODULE_ID}.libraryChanged`, this.#hookId);
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await LibraryStore.update("decks", this.deckId, deck => {
      if ( data.name !== undefined ) deck.name = data.name;
      if ( "folder" in data ) deck.folder = data.folder || null;
      if ( "loop" in data ) deck.loop = !!data.loop;
      if ( "transitionType" in data ) {
        deck.transition = data.transitionType ? { type: data.transitionType, duration: data.transitionDuration ?? 1000 } : null;
      }
      if ( data.items ) {
        deck.items = indexedToArray(data.items).map(item => ({
          ...deck.items.find(i => i.id === item.id), ...item, step: Number(item.step ?? 0)
        }));
      }
    });
  }

  static async #onAddItem() {
    const sceneId = this.element.querySelector("select[name=addScene]")?.value;
    if ( !sceneId ) return;
    await LibraryStore.update("decks", this.deckId, deck => {
      deck.items.push({ id: randomId(), sceneId, step: 0, duration: 10 });
    });
  }

  static async #onRemoveItem(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    await LibraryStore.update("decks", this.deckId, deck => {
      deck.items.splice(index, 1);
    });
  }

  static async #onMoveItem(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const to = index + Number(target.dataset.delta);
    await LibraryStore.update("decks", this.deckId, deck => {
      if ( to < 0 || to >= deck.items.length ) return;
      const [item] = deck.items.splice(index, 1);
      deck.items.splice(to, 0, item);
    });
  }

  static #onPlay() {
    return LiveController.showSlide(this.deckId, 0);
  }
}
