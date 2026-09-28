/**
 * Editor for a library character: general data, owners and actor link, looks, border and nameplate.
 * Changes are saved immediately and appear on stage in real time.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { groupLookFiles } from "../utils/filenames.mjs";
import { randomId } from "../utils/ids.mjs";
import { t, getDragData, indexedToArray, isVideoPath, pickFile } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const BORDER_STYLES = ["none", "solid", "double", "gradient", "spin", "pulse", "rainbow", "flame"];

export default class CharacterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ characterId, ...options } = {}) {
    super({ id: `immersive-character-editor-${characterId}`, ...options });
    this.characterId = characterId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["immersive-scenes", "character-editor", "themed", "theme-dark"],
    tag: "form",
    window: { icon: "fa-solid fa-user-pen", resizable: true },
    position: { width: 680, height: 760 },
    form: { handler: CharacterEditor.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      addLook: CharacterEditor.#onAddLook,
      importLooks: CharacterEditor.#onImportLooks,
      removeLook: CharacterEditor.#onRemoveLook,
      moveLook: CharacterEditor.#onMoveLook,
      setDefault: CharacterEditor.#onSetDefault,
      setCurrent: CharacterEditor.#onSetCurrent,
      unlinkActor: CharacterEditor.#onUnlinkActor,
      openActor: CharacterEditor.#onOpenActor
    }
  };

  static PARTS = {
    banner: { template: template("apps/character-editor/banner.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    general: { template: template("apps/character-editor/general.hbs") },
    looks: { template: template("apps/character-editor/looks.hbs"), scrollable: [""] },
    border: { template: template("apps/character-editor/border.hbs") }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "general", icon: "fa-solid fa-id-card" },
        { id: "looks", icon: "fa-solid fa-shirt" },
        { id: "border", icon: "fa-solid fa-palette" }
      ],
      initial: "looks",
      labelPrefix: "IMMERSIVE_SCENES.CharacterEditor.Tabs"
    }
  };

  characterId;

  #hookIds = [];

  get character() {
    return LibraryStore.getCharacter(this.characterId);
  }

  get title() {
    return `${t("CharacterEditor.Title")}: ${this.character?.name ?? ""}`;
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const character = this.character;
    if ( !character ) return context;
    const current = resolveLook(character);
    const actor = character.actorUuid ? fromUuidSync(character.actorUuid, { strict: false }) : null;
    const folders = LibraryStore.list("folders").filter(f => f.type === "character");
    Object.assign(context, {
      character,
      folderOptions: { "": t("Fields.NoFolder"), ...Object.fromEntries(folders.map(f => [f.id, f.name])) },
      actor: actor ? { name: actor.name, img: actor.img } : null,
      actorMissing: !!character.actorUuid && !actor,
      users: game.users.filter(u => !u.isGM).map(u => ({
        id: u.id, name: u.name, color: u.color?.css ?? "#888", checked: character.ownerIds.includes(u.id)
      })),
      looks: character.looks.map((l, i) => ({
        ...l,
        index: i,
        first: i === 0,
        last: i === character.looks.length - 1,
        isDefault: l.id === (character.defaultLookId ?? character.looks[0]?.id),
        isCurrent: l.id === current?.id,
        spriteIsVideo: isVideoPath(l.sprite),
        portraitIsVideo: isVideoPath(l.portrait),
        previewSprite: lookImage(l, "hero"),
        previewPortrait: lookImage(l, "token")
      })),
      borderStyles: Object.fromEntries(BORDER_STYLES.map(s => [s, t(`Border.${s}`)])),
      borderShapes: Object.fromEntries(["circle", "rounded", "square"].map(s => [s, t(`Shape.${s}`)])),
      borderPreview: current ? lookImage(current, "token") : "",
      banner: {
        sprite: current ? lookImage(current, "hero") : (actor?.img ?? ""),
        lookName: current?.name ?? "",
        looks: character.looks.length,
        border: t(`Border.${character.border.style}`)
      }
    });
    context.banner.spriteIsVideo = isVideoPath(context.banner.sprite);
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#hookIds = [[`${MODULE_ID}.libraryChanged`, Hooks.on(`${MODULE_ID}.libraryChanged`, key => {
      if ( key !== "characters" && key !== "folders" ) return;
      if ( !this.character ) return this.close();
      this.render();
    })]];
  }

  _onClose(options) {
    super._onClose(options);
    for ( const [name, id] of this.#hookIds ) Hooks.off(name, id);
    this.#hookIds = [];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const zone = this.element.querySelector(".actor-drop");
    if ( zone ) {
      zone.addEventListener("dragover", event => event.preventDefault());
      zone.addEventListener("drop", event => this.#onDropActor(event));
    }
  }

  async #onDropActor(event) {
    event.preventDefault();
    const data = getDragData(event);
    if ( data?.type !== "Actor" ) return;
    const actor = await fromUuid(data.uuid);
    if ( !actor || actor.pack ) return ui.notifications.warn("IMMERSIVE_SCENES.Warnings.CompendiumActor", { localize: true });
    await this.#edit(c => {
      c.actorUuid = actor.uuid;
    });
  }

  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const character = this.character;
    if ( !character ) return;
    const data = foundry.utils.expandObject(formData.object);
    const byId = id => character.looks.find(l => l.id === id) ?? {};
    await this.#edit(c => {
      if ( data.name !== undefined ) c.name = data.name;
      if ( Array.isArray(data.tags) ) c.tags = data.tags;
      if ( "folder" in data ) c.folder = data.folder || null;
      if ( data.owners ) c.ownerIds = Object.entries(data.owners).filter(([, v]) => v).map(([id]) => id);
      if ( data.looks ) c.looks = indexedToArray(data.looks).map(l => ({ ...byId(l.id), ...l }));
      if ( data.border ) {
        const colors = data.border.colors ? indexedToArray(data.border.colors) : c.border.colors;
        c.border = { ...c.border, ...data.border, colors };
      }
      if ( data.nameplate ) c.nameplate = { ...c.nameplate, ...data.nameplate };
    });
  }

  #edit(fn) {
    return LibraryStore.update("characters", this.characterId, fn);
  }

  static async #onAddLook() {
    const src = await pickFile({ type: "imagevideo" });
    if ( !src ) return;
    const name = decodeURIComponent(src.split("/").pop().replace(/\.[^.]+$/, ""));
    await this.#edit(c => {
      const look = { id: randomId(), name, sprite: src, portrait: "" };
      c.looks.push(look);
      c.defaultLookId ??= look.id;
    });
  }

  /** Import every image/video of a folder whose file name starts with this character's name. */
  static async #onImportLooks() {
    const folder = await pickFile({ type: "folder" });
    if ( !folder ) return;
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    let result;
    try {
      result = await FilePicker.browse("data", folder);
    }
    catch(err) {
      return ui.notifications.error(err.message);
    }
    const files = (result?.files ?? []).filter(f => /\.(webp|png|jpe?g|gif|avif|svg|webm|mp4|m4v|ogv)$/i.test(f));
    const groups = groupLookFiles(files);
    const character = this.character;
    const wanted = character.name.toLowerCase();
    // Use the files named after this character, or everything if nothing matches
    const match = [...groups.entries()].find(([name]) => name.toLowerCase() === wanted);
    const looks = match ? [...match[1].values()] : [...groups.values()].flatMap(m => [...m.values()]);
    const known = new Set(character.looks.flatMap(l => [l.sprite, l.portrait]).filter(Boolean));
    const fresh = looks.filter(l => !known.has(l.sprite) && !known.has(l.portrait));
    if ( !fresh.length ) return ui.notifications.info("IMMERSIVE_SCENES.CharacterEditor.NothingToImport", { localize: true });
    await this.#edit(c => {
      for ( const look of fresh ) c.looks.push({ id: randomId(), ...look });
      c.defaultLookId ??= c.looks[0]?.id ?? null;
    });
    ui.notifications.info(t("CharacterEditor.Imported", { count: fresh.length }));
  }

  static async #onRemoveLook(event, target) {
    const lookId = target.closest("[data-look-id]").dataset.lookId;
    await this.#edit(c => {
      c.looks = c.looks.filter(l => l.id !== lookId);
      if ( c.defaultLookId === lookId ) c.defaultLookId = c.looks[0]?.id ?? null;
      if ( c.currentLookId === lookId ) c.currentLookId = null;
    });
  }

  static async #onMoveLook(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const delta = Number(target.dataset.delta);
    await this.#edit(c => {
      const to = index + delta;
      if ( to < 0 || to >= c.looks.length ) return;
      const [look] = c.looks.splice(index, 1);
      c.looks.splice(to, 0, look);
    });
  }

  static async #onSetDefault(event, target) {
    const lookId = target.closest("[data-look-id]").dataset.lookId;
    await this.#edit(c => {
      c.defaultLookId = lookId;
    });
  }

  static async #onSetCurrent(event, target) {
    const lookId = target.closest("[data-look-id]").dataset.lookId;
    await this.#edit(c => {
      c.currentLookId = lookId;
    });
    Hooks.callAll(`${MODULE_ID}.lookChanged`, this.characterId, lookId, game.user);
  }

  static async #onUnlinkActor() {
    await this.#edit(c => {
      c.actorUuid = null;
    });
  }

  static async #onOpenActor() {
    const actor = await fromUuid(this.character.actorUuid);
    actor?.sheet?.render(true);
  }
}
