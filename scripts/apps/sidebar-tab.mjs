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
  KINDS, openEditor, decorateRecord, createFolder, createRecord, createRecordContextMenu, createFolderContextMenu,
  handleLibraryDrop, activateCardDrag
} from "./library-shared.mjs";
import { openLibrary } from "./library.mjs";
import { t, getUiState, setUiState, sceneThumb, isVideoPath, getDragData } from "./helpers.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { AbstractSidebarTab } = foundry.applications.sidebar;

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
      openLibrary: ImmersiveSidebarTab.#onOpenLibrary,
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
      live: liveScene ? {
        name: liveScene.name, id: liveScene.id, step: live.step + 1, steps: liveScene.backgrounds.length,
        image: liveScene.backgrounds[live.step]?.src || sceneThumb(liveScene),
        isVideo: isVideoPath(liveScene.backgrounds[live.step]?.src || sceneThumb(liveScene)),
        mode: t(`Mode.${live.mode ?? liveScene.mode}`)
      } : null,
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
    const decorate = record => decorateRecord(kind, record, live);
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
      createLabel: t(`Library.New.${kind}`),
      folders: tree.children.map(decorateNode),
      items: tree.items.map(decorate),
      empty: !records.length,
      tags: tags.map(tag => ({ tag, active: this.#filter.tags.includes(tag) })),
      favorites: this.#filter.favorites,
      query: this.#filter.query,
      supportsFavorites: true
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
    createRecordContextMenu(this.element, ".is-card");
    createFolderContextMenu(this.element, ".lib-folder > header", folderId => this.#setExpanded(folderId, true));
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  #activateDragDrop(html) {
    activateCardDrag(html, ".is-card[draggable=true]");
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
    await handleLibraryDrop(data, { kind: this.kind, folderId });
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
    const record = await createRecord(kind);
    openEditor({ kind, id: record.id });
  }

  static async #onCreateFolder() {
    return createFolder(this.kind, null);
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

  static #onOpenLibrary() {
    return openLibrary();
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
