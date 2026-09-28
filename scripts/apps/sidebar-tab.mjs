/**
 * The Immersive Scenes sidebar tab: one-click access to the library (GM) and to your own
 * characters' looks and borders (players).
 */
import { MODULE_ID, SIDEBAR_TAB, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import StageDirector from "../canvas/director.mjs";
import { isCharacterOwner, canPerform } from "../data/permissions.mjs";
import { buildTree, matchesFilter, collectTags } from "../utils/tree.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { requestCharacterAction } from "../queries.mjs";
import {
  t, promptText, confirmDelete, getUiState, setUiState, sceneThumb, isVideoPath, getDragData
} from "./helpers.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

const KINDS = {
  scenes: { collection: "scenes", folderType: "scene", icon: "fa-solid fa-image" },
  characters: { collection: "characters", folderType: "character", icon: "fa-solid fa-user" },
  decks: { collection: "decks", folderType: "deck", icon: "fa-solid fa-film" }
};

const MODE_ICONS = { token: "fa-solid fa-circle-user", hero: "fa-solid fa-person", cast: "fa-solid fa-layer-group" };

export default class ImmersiveSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  constructor(options) {
    super(options);
    this.#filter = { query: "", tags: [], favorites: false };
  }

  static tabName = SIDEBAR_TAB;

  static DEFAULT_OPTIONS = {
    classes: ["immersive-scenes", "immersive-scenes-tab"],
    window: { title: "IMMERSIVE_SCENES.Title" },
    actions: {
      switchTab: ImmersiveSidebarTab.#onSwitchTab,
      createEntry: ImmersiveSidebarTab.#onCreateEntry,
      createFolder: ImmersiveSidebarTab.#onCreateFolder,
      toggleFolder: ImmersiveSidebarTab.#onToggleFolder,
      toggleTag: ImmersiveSidebarTab.#onToggleTag,
      toggleFavorites: ImmersiveSidebarTab.#onToggleFavorites,
      broadcast: ImmersiveSidebarTab.#onBroadcast,
      preview: ImmersiveSidebarTab.#onPreview,
      edit: ImmersiveSidebarTab.#onEdit,
      stopLive: ImmersiveSidebarTab.#onStopLive,
      stopPreview: ImmersiveSidebarTab.#onStopPreview,
      openDock: ImmersiveSidebarTab.#onOpenDock,
      playDeck: ImmersiveSidebarTab.#onPlayDeck,
      setLook: ImmersiveSidebarTab.#onSetLook,
      editBorder: ImmersiveSidebarTab.#onEditBorder
    }
  };

  static PARTS = {
    tab: {
      template: template("sidebar/tab.hbs"),
      templates: [template("sidebar/folder.hbs"), template("sidebar/card.hbs")],
      scrollable: [".library-content", ".player-content"]
    }
  };

  /** Current search and filter state (not persisted). */
  #filter;

  /** Hook ids to remove on close. */
  #hooks = [];

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  get kind() {
    const kind = getUiState("sidebar.tab", "scenes");
    return KINDS[kind] ? kind : "scenes";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const live = StageDirector.live;
    const liveScene = live.active ? LibraryStore.getScene(live.sceneId) : null;
    const preview = StageDirector.preview;
    Object.assign(context, {
      isGM: game.user.isGM,
      canControl: LiveController.canControl,
      live: liveScene ? { name: liveScene.name, id: liveScene.id, step: live.step + 1, steps: liveScene.backgrounds.length } : null,
      preview: preview ? { name: LibraryStore.getScene(preview.sceneId)?.name ?? "?" } : null
    });
    if ( context.canControl ) this.#prepareLibrary(context, live);
    context.myCharacters = this.#prepareMyCharacters(live);
    return context;
  }

  #prepareLibrary(context, live) {
    const kind = this.kind;
    const { collection, folderType } = KINDS[kind];
    const records = LibraryStore.list(collection);
    const folders = LibraryStore.list("folders").filter(f => f.type === folderType);
    const expanded = new Set(getUiState(`sidebar.expanded.${kind}`, []));
    const decorate = record => this.#decorate(kind, record, live);
    const decorateNode = node => ({
      ...node,
      expanded: expanded.has(node.folder.id),
      items: node.items.map(decorate),
      children: node.children.map(decorateNode)
    });
    const tree = buildTree(folders, records);
    const tags = collectTags(records);
    context.library = {
      kind,
      tabs: Object.entries(KINDS).map(([id, k]) => ({
        id, icon: k.icon, label: t(`Library.Tabs.${id}`), active: id === kind
      })),
      createLabel: t(`Library.Create.${kind}`),
      folders: tree.children.map(decorateNode),
      items: tree.items.map(decorate),
      empty: !records.length,
      tags: tags.map(tag => ({ tag, active: this.#filter.tags.includes(tag) })),
      favorites: this.#filter.favorites,
      query: this.#filter.query,
      supportsFavorites: kind === "scenes"
    };
  }

  #decorate(kind, record, live) {
    const base = {
      id: record.id,
      kind,
      name: record.name,
      tags: record.tags ?? [],
      searchTags: (record.tags ?? []).join(",").toLowerCase(),
      favorite: !!record.favorite
    };
    if ( kind === "scenes" ) {
      const thumb = sceneThumb(record);
      return {
        ...base,
        thumb,
        isVideo: isVideoPath(thumb),
        modeIcon: MODE_ICONS[record.mode],
        modeLabel: t(`Mode.${record.mode}`),
        live: live.active && live.sceneId === record.id,
        steps: record.backgrounds.length > 1 ? record.backgrounds.length : 0,
        castCount: record.cast.length
      };
    }
    if ( kind === "characters" ) {
      const look = resolveLook(record);
      const thumb = lookImage(look, "token") || actorImage(record);
      return {
        ...base,
        thumb,
        isVideo: isVideoPath(thumb),
        looks: record.looks.length,
        linked: !!record.actorUuid,
        round: true
      };
    }
    const first = LibraryStore.getScene(record.items[0]?.sceneId);
    const thumb = first ? sceneThumb(first) : "";
    return {
      ...base,
      thumb,
      isVideo: isVideoPath(thumb),
      slides: record.items.length,
      playing: live.deck?.id === record.id
    };
  }

  /** Characters the current user may style, with their looks. */
  #prepareMyCharacters(live) {
    const liveScene = live.active ? LibraryStore.getScene(live.sceneId) : null;
    const onStage = new Set(liveScene?.cast.map(e => e.characterId) ?? []);
    return LibraryStore.list("characters")
      .filter(c => !game.user.isGM && isCharacterOwner(game.user, c))
      .map(c => {
        const current = resolveLook(c);
        return {
          id: c.id,
          name: c.name,
          onStage: onStage.has(c.id),
          canLook: canPerform(game.user, c, "setLook"),
          canBorder: canPerform(game.user, c, "setBorder"),
          looks: c.looks.map(l => ({
            id: l.id,
            name: l.name,
            thumb: lookImage(l, "token"),
            isVideo: isVideoPath(lookImage(l, "token")),
            active: l.id === current?.id
          }))
        };
      })
      .sort((a, b) => (b.onStage - a.onStage) || a.name.localeCompare(b.name));
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = () => this.render();
    this.#hooks = [
      [`${MODULE_ID}.libraryChanged`, Hooks.on(`${MODULE_ID}.libraryChanged`, rerender)],
      [`${MODULE_ID}.liveStateChanged`, Hooks.on(`${MODULE_ID}.liveStateChanged`, rerender)],
      [`${MODULE_ID}.previewChanged`, Hooks.on(`${MODULE_ID}.previewChanged`, rerender)]
    ];
    if ( LiveController.canControl ) this.#createContextMenus();
  }

  _onClose(options) {
    super._onClose(options);
    for ( const [name, id] of this.#hooks ) Hooks.off(name, id);
    this.#hooks = [];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    const search = html.querySelector("input[name=search]");
    if ( search ) {
      search.addEventListener("input", event => {
        this.#filter.query = event.currentTarget.value;
        this.#applyFilter();
      });
    }
    this.#applyFilter();
    if ( LiveController.canControl ) this.#activateDragDrop(html);
  }

  /** Show or hide cards and folders according to the filter, without re-rendering. */
  #applyFilter() {
    const root = this.element.querySelector(".library-content");
    if ( !root ) return;
    const filter = this.#filter;
    const filtering = !!filter.query.trim() || filter.tags.length || filter.favorites;
    for ( const card of root.querySelectorAll(".is-card") ) {
      const record = {
        name: card.dataset.name,
        tags: card.dataset.tags ? card.dataset.tags.split(",") : [],
        favorite: card.dataset.favorite === "true"
      };
      card.hidden = !matchesFilter(record, filter);
    }
    // Hide folders without visible content; expand all folders while filtering
    const folders = [...root.querySelectorAll(".lib-folder")].reverse();
    for ( const folder of folders ) {
      const visible = !!folder.querySelector(":scope > .folder-content .is-card:not([hidden])");
      folder.hidden = filtering && !visible;
      folder.classList.toggle("force-open", filtering && visible);
    }
  }

  /* -------------------------------------------- */
  /*  Context menus                               */
  /* -------------------------------------------- */

  #createContextMenus() {
    const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
    const record = li => ({ kind: li.dataset.kind, id: li.dataset.id });
    const scene = li => li.dataset.kind === "scenes";
    const menu = [
      { label: "IMMERSIVE_SCENES.Actions.Broadcast", icon: "fa-solid fa-tower-broadcast", visible: scene,
        onClick: (e, li) => LiveController.broadcast(li.dataset.id) },
      { label: "IMMERSIVE_SCENES.Actions.Preview", icon: "fa-solid fa-eye", visible: scene,
        onClick: (e, li) => StageDirector.startPreview(li.dataset.id) },
      { label: "IMMERSIVE_SCENES.Actions.Edit", icon: "fa-solid fa-pen-to-square",
        onClick: (e, li) => openEditor(record(li)) },
      { label: "IMMERSIVE_SCENES.Actions.ToggleFavorite", icon: "fa-solid fa-star", visible: scene,
        onClick: (e, li) => {
          const s = LibraryStore.getScene(li.dataset.id);
          return LibraryStore.update("scenes", s.id, { favorite: !s.favorite });
        } },
      { label: "IMMERSIVE_SCENES.Actions.AddToLive", icon: "fa-solid fa-user-plus",
        visible: li => li.dataset.kind === "characters" && StageDirector.live.active,
        onClick: (e, li) => LibraryStore.addToCast(StageDirector.live.sceneId, li.dataset.id) },
      { label: "IMMERSIVE_SCENES.Actions.Duplicate", icon: "fa-solid fa-copy",
        onClick: (e, li) => LibraryStore.duplicate(KINDS[li.dataset.kind].collection, li.dataset.id) },
      { label: "IMMERSIVE_SCENES.Actions.RemoveFromFolder", icon: "fa-solid fa-folder-minus",
        visible: li => !!li.closest(".lib-folder"),
        onClick: (e, li) => LibraryStore.update(KINDS[li.dataset.kind].collection, li.dataset.id, { folder: null }) },
      { label: "IMMERSIVE_SCENES.Actions.Delete", icon: "fa-solid fa-trash",
        onClick: async (e, li) => {
          const { collection } = KINDS[li.dataset.kind];
          const r = LibraryStore.collection(collection)[li.dataset.id];
          if ( r && await confirmDelete(r.name) ) await LibraryStore.delete(collection, r.id);
        } }
    ];
    new ContextMenu(this.element, ".is-card", menu, { jQuery: false, fixed: true });

    const folderMenu = [
      { label: "IMMERSIVE_SCENES.Actions.Rename", icon: "fa-solid fa-i-cursor",
        onClick: async (e, header) => {
          const folder = LibraryStore.getFolder(header.dataset.folderId);
          const name = await promptText({ title: t("Actions.Rename"), label: t("Fields.Name"), value: folder.name });
          if ( name ) await LibraryStore.update("folders", folder.id, { name });
        } },
      { label: "IMMERSIVE_SCENES.Actions.CreateSubfolder", icon: "fa-solid fa-folder-plus",
        onClick: (e, header) => this.#createFolder(header.dataset.folderId) },
      { label: "IMMERSIVE_SCENES.Actions.Delete", icon: "fa-solid fa-trash",
        onClick: async (e, header) => {
          const folder = LibraryStore.getFolder(header.dataset.folderId);
          if ( folder && await confirmDelete(folder.name) ) await LibraryStore.delete("folders", folder.id);
        } }
    ];
    new ContextMenu(this.element, ".lib-folder > header", folderMenu, { jQuery: false, fixed: true });
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  #activateDragDrop(html) {
    for ( const card of html.querySelectorAll(".is-card[draggable=true]") ) {
      card.addEventListener("dragstart", event => {
        const data = { type: `${MODULE_ID}.${card.dataset.kind}`, id: card.dataset.id };
        event.dataTransfer.setData("text/plain", JSON.stringify(data));
      });
    }
    const content = html.querySelector(".library-content");
    if ( !content ) return;
    content.addEventListener("dragover", event => event.preventDefault());
    content.addEventListener("drop", event => this.#onDrop(event));
  }

  async #onDrop(event) {
    event.preventDefault();
    const data = getDragData(event);
    if ( !data ) return;
    const folderId = event.target.closest(".lib-folder")?.dataset.folderId ?? null;

    // Library entries dropped on folders are moved there
    const [ns, kind] = String(data.type ?? "").split(".");
    if ( ns === MODULE_ID && KINDS[kind] ) {
      if ( kind !== this.kind ) return;
      return LibraryStore.update(KINDS[kind].collection, data.id, { folder: folderId });
    }

    // Actors become characters
    if ( data.type === "Actor" ) {
      const actor = await fromUuid(data.uuid);
      if ( !actor ) return;
      if ( actor.pack ) return ui.notifications.warn("IMMERSIVE_SCENES.Warnings.CompendiumActor", { localize: true });
      const character = await LibraryStore.createCharacterFromActor(actor);
      if ( folderId && this.kind === "characters" ) await LibraryStore.update("characters", character.id, { folder: folderId });
      return;
    }

    // Tiles or images (e.g. from the file browser) become scenes
    const src = data.texture?.src ?? data.src ?? null;
    if ( src && this.kind === "scenes" ) {
      const name = decodeURIComponent(src.split("/").pop().replace(/\.[^.]+$/, ""));
      await LibraryStore.create("scenes", { name, folder: folderId, backgrounds: [{ src }] });
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onSwitchTab(event, target) {
    await setUiState("sidebar.tab", target.dataset.tab);
    this.#filter.tags = [];
    this.render();
  }

  static async #onCreateEntry() {
    const kind = this.kind;
    const record = await LibraryStore.create(KINDS[kind].collection, {
      name: t(`Library.New.${kind}`)
    });
    openEditor({ kind, id: record.id });
  }

  static async #onCreateFolder() {
    return this.#createFolder(null);
  }

  async #createFolder(parent) {
    const name = await promptText({ title: t("Actions.CreateFolder"), label: t("Fields.Name") });
    if ( !name ) return;
    await LibraryStore.create("folders", { name, parent, type: KINDS[this.kind].folderType });
    if ( parent ) await this.#setExpanded(parent, true);
  }

  static async #onToggleFolder(event, target) {
    const folder = target.closest(".lib-folder");
    const open = !folder.classList.contains("expanded");
    folder.classList.toggle("expanded", open);
    await this.#setExpanded(folder.dataset.folderId, open);
  }

  async #setExpanded(folderId, open) {
    const key = `sidebar.expanded.${this.kind}`;
    const expanded = new Set(getUiState(key, []));
    if ( open ) expanded.add(folderId);
    else expanded.delete(folderId);
    await setUiState(key, [...expanded]);
  }

  static #onToggleTag(event, target) {
    const tag = target.dataset.tag;
    const tags = new Set(this.#filter.tags);
    if ( tags.has(tag) ) tags.delete(tag);
    else tags.add(tag);
    this.#filter.tags = [...tags];
    target.classList.toggle("active", tags.has(tag));
    this.#applyFilter();
  }

  static #onToggleFavorites(event, target) {
    this.#filter.favorites = !this.#filter.favorites;
    target.classList.toggle("active", this.#filter.favorites);
    this.#applyFilter();
  }

  static #onBroadcast(event, target) {
    const id = target.closest("[data-id]").dataset.id;
    return LiveController.broadcast(id);
  }

  static #onPreview(event, target) {
    const id = target.closest("[data-id]").dataset.id;
    return StageDirector.startPreview(id);
  }

  static #onEdit(event, target) {
    const card = target.closest("[data-id]");
    return openEditor({ kind: card.dataset.kind, id: card.dataset.id });
  }

  static #onStopLive() {
    return LiveController.stop();
  }

  static #onStopPreview() {
    return StageDirector.stopPreview();
  }

  static #onOpenDock() {
    return game.modules.get(MODULE_ID).api.openDock?.();
  }

  static #onPlayDeck(event, target) {
    const id = target.closest("[data-id]").dataset.id;
    return game.modules.get(MODULE_ID).api.playDeck?.(id);
  }

  static async #onSetLook(event, target) {
    const characterId = target.closest("[data-character-id]").dataset.characterId;
    await requestCharacterAction(characterId, "setLook", { lookId: target.dataset.lookId });
  }

  static #onEditBorder(event, target) {
    const characterId = target.closest("[data-character-id]").dataset.characterId;
    return game.modules.get(MODULE_ID).api.openBorderEditor?.(characterId);
  }
}

/** Open the editor for a library record. */
export function openEditor({ kind, id }) {
  const api = game.modules.get(MODULE_ID).api;
  if ( kind === "scenes" ) return api.editScene(id);
  if ( kind === "characters" ) return api.editCharacter(id);
  if ( kind === "decks" ) return api.editDeck?.(id);
}

function actorImage(character) {
  if ( !character.actorUuid ) return "";
  return fromUuidSync(character.actorUuid, { strict: false })?.img ?? "";
}

/**
 * Register the tab with the sidebar. Must run during `init`, before the UI is created.
 */
export function registerSidebarTab() {
  CONFIG.ui[SIDEBAR_TAB] = ImmersiveSidebarTab;
  const Sidebar = CONFIG.ui.sidebar;
  const tabs = {};
  for ( const [key, value] of Object.entries(Sidebar.TABS) ) {
    if ( key === "settings" ) tabs[SIDEBAR_TAB] = { tooltip: "IMMERSIVE_SCENES.Title", icon: "fa-solid fa-masks-theater" };
    tabs[key] = value;
  }
  tabs[SIDEBAR_TAB] ??= { tooltip: "IMMERSIVE_SCENES.Title", icon: "fa-solid fa-masks-theater" };
  Sidebar.TABS = tabs;
}
