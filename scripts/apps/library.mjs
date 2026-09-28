/**
 * The library window: a full-size browser for scenes, characters and slideshows with a folder
 * navigation, a thumbnail grid and an inspector for the selected entry. The GM's main workspace
 * for preparing and starting scenes.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import StageDirector from "../canvas/director.mjs";
import { setCurrentLook } from "../data/scene-ops.mjs";
import { buildTree, matchesFilter, collectTags, sortRecords, folderPath, folderDescendants } from "../utils/tree.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { randomId } from "../utils/ids.mjs";
import {
  KINDS, MODE_ICONS, openEditor, decorateRecord, toggleFavorite, createFolder, createRecord, characterThumb,
  characterSprite, formatDuration, createRecordContextMenu, createFolderContextMenu, handleLibraryDrop,
  activateCardDrag, activateDropTargets, importPlayerCharacters
} from "./library-shared.mjs";
import ActorSync from "../data/actor-sync.mjs";
import { t, getUiState, setUiState, sceneThumb, isVideoPath, getDragData, pickFile } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SORTS = ["name", "-name", "recent"];

export default class LibraryWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    const width = Math.min(1200, Math.max(760, window.innerWidth - 160));
    const height = Math.min(800, Math.max(520, window.innerHeight - 140));
    super(foundry.utils.mergeObject({ position: { width, height } }, options));
    const kind = getUiState("library.kind", "scenes");
    this.#state.kind = KINDS[kind] ? kind : "scenes";
    this.#state.folderId = this.#validFolder(getUiState(`library.folder.${this.#state.kind}`, null));
    this.#state.sort = SORTS.includes(getUiState("library.sort")) ? getUiState("library.sort") : "name";
    this.#state.layout = getUiState("library.layout", "grid") === "list" ? "list" : "grid";
  }

  static DEFAULT_OPTIONS = {
    id: "immersive-library",
    classes: ["immersive-scenes", "is-library", "themed", "theme-dark"],
    window: { title: "IMMERSIVE_SCENES.Title", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 1180, height: 760 },
    actions: {
      showKind: LibraryWindow.#onShowKind,
      openFolder: LibraryWindow.#onOpenFolder,
      select: LibraryWindow.#onSelect,
      deselect: LibraryWindow.#onDeselect,
      favorite: LibraryWindow.#onFavorite,
      create: LibraryWindow.#onCreate,
      createFolder: LibraryWindow.#onCreateFolder,
      toggleTag: LibraryWindow.#onToggleTag,
      clearFilters: LibraryWindow.#onClearFilters,
      setLayout: LibraryWindow.#onSetLayout,
      broadcast: LibraryWindow.#onBroadcast,
      stopLive: LibraryWindow.#onStopLive,
      preview: LibraryWindow.#onPreview,
      endPreview: LibraryWindow.#onEndPreview,
      edit: LibraryWindow.#onEdit,
      setMode: LibraryWindow.#onSetMode,
      setStep: LibraryWindow.#onSetStep,
      addBackground: LibraryWindow.#onAddBackground,
      toggleCastPicker: LibraryWindow.#onToggleCastPicker,
      addCast: LibraryWindow.#onAddCast,
      removeCast: LibraryWindow.#onRemoveCast,
      setLook: LibraryWindow.#onSetLook,
      addToLive: LibraryWindow.#onAddToLive,
      editBorder: LibraryWindow.#onEditBorder,
      showScene: LibraryWindow.#onShowScene,
      playDeck: LibraryWindow.#onPlayDeck,
      pauseDeck: LibraryWindow.#onPauseDeck,
      stopDeck: LibraryWindow.#onStopDeck,
      openDock: LibraryWindow.#onOpenDock,
      importPlayers: LibraryWindow.#onImportPlayers,
      syncActor: LibraryWindow.#onSyncActor
    }
  };

  static PARTS = {
    nav: { template: template("apps/library/nav.hbs"), scrollable: [".nav-scroll"] },
    toolbar: { template: template("apps/library/toolbar.hbs") },
    grid: {
      template: template("apps/library/grid.hbs"),
      templates: [template("apps/library/card.hbs")],
      scrollable: [".grid-scroll"]
    },
    inspector: { template: template("apps/library/inspector.hbs"), scrollable: [".inspector-scroll"] }
  };

  /** Browsing state. */
  #state = {
    kind: "scenes",
    view: "all",
    folderId: null,
    selected: null,
    query: "",
    tags: [],
    sort: "name",
    layout: "grid",
    castPicker: false,
    step: 0
  };

  #hookIds = [];

  #searchTimer = null;

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  get kind() {
    return this.#state.kind;
  }

  #validFolder(folderId) {
    const folder = folderId ? LibraryStore.getFolder(folderId) : null;
    return folder?.type === KINDS[this.#state.kind].folderType ? folder.id : null;
  }

  get #filtering() {
    return !!this.#state.query.trim() || this.#state.tags.length > 0 || this.#state.view === "favorites";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Drop a stale selection or folder (e.g. deleted elsewhere)
    const sel = this.#state.selected;
    if ( sel && !LibraryStore.collection(KINDS[sel.kind].collection)[sel.id] ) this.#state.selected = null;
    this.#state.folderId = this.#validFolder(this.#state.folderId);
    context.live = StageDirector.live;
    context.state = this.#state;
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "nav": Object.assign(context, this.#prepareNav(context.live)); break;
      case "toolbar": Object.assign(context, this.#prepareToolbar()); break;
      case "grid": Object.assign(context, this.#prepareGrid(context.live)); break;
      case "inspector": context.inspector = this.#prepareInspector(context.live); break;
    }
    return context;
  }

  #prepareNav(live) {
    const state = this.#state;
    const section = kind => {
      const records = LibraryStore.list(KINDS[kind].collection);
      const folders = LibraryStore.list("folders").filter(f => f.type === KINDS[kind].folderType);
      const flat = [];
      const walk = nodes => {
        for ( const node of nodes ) {
          flat.push({
            id: node.folder.id, name: node.folder.name, color: node.folder.color, depth: node.depth, count: node.count,
            active: state.kind === kind && state.view === "all" && state.folderId === node.folder.id
          });
          walk(node.children);
        }
      };
      walk(buildTree(folders, records).children);
      const isKind = state.kind === kind;
      return {
        kind,
        label: t(`Library.Tabs.${kind}`),
        views: [
          { view: "all", label: t(`Library.All.${kind}`), icon: KINDS[kind].icon, count: records.length,
            active: isKind && state.view === "all" && !state.folderId },
          { view: "favorites", label: t("Library.Favorites"), icon: "fa-solid fa-star",
            count: records.filter(r => r.favorite).length, active: isKind && state.view === "favorites" }
        ],
        folders: flat
      };
    };
    const decks = LibraryStore.list("decks").map(d => ({
      id: d.id,
      name: d.name,
      slides: d.items.length,
      playing: live.deck?.id === d.id,
      active: this.#state.selected?.kind === "decks" && this.#state.selected.id === d.id
    }));
    const liveScene = live.active ? LibraryStore.getScene(live.sceneId) : null;
    return {
      sections: [section("scenes"), section("characters")],
      decks,
      liveScene: liveScene ? { id: liveScene.id, name: liveScene.name } : null
    };
  }

  #prepareToolbar() {
    const state = this.#state;
    const records = LibraryStore.list(KINDS[state.kind].collection);
    const crumbs = [{ label: t(`Library.Tabs.${state.kind}`), icon: KINDS[state.kind].icon, folderId: "", kind: state.kind }];
    if ( state.view === "favorites" ) crumbs.push({ label: t("Library.Favorites"), icon: "fa-solid fa-star", current: true });
    else {
      for ( const folder of folderPath(LibraryStore.folders, state.folderId) ) {
        crumbs.push({ label: folder.name, icon: "fa-solid fa-folder", folderId: folder.id, kind: state.kind });
      }
    }
    crumbs.at(-1).current = true;
    return {
      crumbs,
      query: state.query,
      sort: state.sort,
      sortOptions: Object.fromEntries(SORTS.map(s => [s, t(`Library.Sort.${s}`)])),
      layoutGrid: state.layout === "grid",
      tags: collectTags(records).slice(0, 24).map(tag => ({ tag, active: state.tags.includes(tag) })),
      filtering: this.#filtering && state.view !== "favorites",
      canFolder: state.view === "all",
      isCharacters: state.kind === "characters"
    };
  }

  #prepareGrid(live) {
    const state = this.#state;
    const { collection, folderType } = KINDS[state.kind];
    const allRecords = LibraryStore.list(collection);
    const folders = LibraryStore.list("folders").filter(f => f.type === folderType);
    const filter = { query: state.query, tags: state.tags, favorites: state.view === "favorites" };
    let records;
    let folderTiles = [];
    let up = null;
    if ( this.#filtering ) {
      // Search the current folder and everything below it
      const scope = state.folderId && state.view === "all" ? folderDescendants(folders, state.folderId) : null;
      records = allRecords.filter(r => matchesFilter(r, filter) && (!scope || scope.has(r.folder)));
    }
    else {
      records = allRecords.filter(r => (r.folder ?? null) === state.folderId
        || (!state.folderId && r.folder && !LibraryStore.getFolder(r.folder)));
      const tree = buildTree(folders, allRecords);
      const find = (nodes, id) => {
        for ( const n of nodes ) {
          if ( n.folder.id === id ) return n;
          const found = find(n.children, id);
          if ( found ) return found;
        }
        return null;
      };
      const children = state.folderId ? (find(tree.children, state.folderId)?.children ?? []) : tree.children;
      folderTiles = children.map(n => ({
        id: n.folder.id, name: n.folder.name, color: n.folder.color, count: n.count,
        previews: previewThumbs(state.kind, n).slice(0, 3)
      }));
      if ( state.folderId ) up = { folderId: LibraryStore.getFolder(state.folderId)?.parent ?? "" };
    }
    const selected = state.selected?.kind === state.kind ? state.selected.id : null;
    const cards = sortRecords(records, state.sort).map(r => ({
      ...decorateRecord(state.kind, r, live),
      selected: r.id === selected,
      showFolder: this.#filtering
    }));
    return {
      kind: state.kind,
      layoutGrid: state.layout === "grid",
      up,
      folderTiles,
      cards,
      empty: !cards.length && !folderTiles.length,
      emptyText: this.#filtering ? t("Library.NoMatches") : t(`Library.Empty.${state.kind}`),
      createLabel: t(`Library.New.${state.kind}`),
      createIcon: { scenes: "fa-solid fa-clapperboard", characters: "fa-solid fa-user-plus", decks: "fa-solid fa-film" }[state.kind]
    };
  }

  #prepareInspector(live) {
    const sel = this.#state.selected;
    if ( !sel ) return { empty: true, hint: t(`Library.Inspector.Select.${this.#state.kind}`) };
    if ( sel.kind === "scenes" ) return this.#inspectScene(LibraryStore.getScene(sel.id), live);
    if ( sel.kind === "characters" ) return this.#inspectCharacter(LibraryStore.getCharacter(sel.id), live);
    return this.#inspectDeck(LibraryStore.getDeck(sel.id), live);
  }

  #inspectScene(scene, live) {
    const isLive = live.active && live.sceneId === scene.id;
    const preview = StageDirector.preview;
    const isPreview = preview?.sceneId === scene.id;
    // Follow the shown step while live or previewed
    if ( isLive ) this.#state.step = live.step;
    else if ( isPreview ) this.#state.step = preview.step ?? 0;
    const step = Math.min(this.#state.step, Math.max(0, scene.backgrounds.length - 1));
    const background = scene.backgrounds[step];
    const image = background?.src || sceneThumb(scene);
    const mode = (isLive ? live.mode : null) ?? scene.mode;
    const characters = LibraryStore.characters;
    const inCast = new Set(scene.cast.map(e => e.characterId));
    return {
      kind: "scenes",
      id: scene.id,
      name: scene.name,
      favorite: scene.favorite,
      isLive,
      isPreview,
      image,
      isVideo: isVideoPath(image),
      color: background?.color || "#000000",
      modeLabel: t(`Mode.${mode}`),
      modeIcon: MODE_ICONS[mode],
      steps: scene.backgrounds.length > 1 ? scene.backgrounds.map((b, i) => ({
        index: i, number: i + 1, src: b.src, isVideo: isVideoPath(b.src), active: i === step, name: b.name || `${i + 1}`
      })) : null,
      stepLabel: scene.backgrounds.length > 1 ? `${step + 1} / ${scene.backgrounds.length}` : "",
      sequenceLabel: scene.backgrounds.length > 1 ? t("Library.Inspector.AddBackground")
        : (scene.backgrounds.length ? t("Library.Inspector.TurnIntoSequence") : t("Library.Inspector.AddBackground")),
      modes: ["hero", "token", "cast"].map(m => ({ id: m, label: t(`Mode.${m}`), icon: MODE_ICONS[m], active: m === scene.mode })),
      tags: scene.tags,
      folderName: scene.folder ? LibraryStore.getFolder(scene.folder)?.name : "",
      layoutLabel: t(`Layout.${scene.layout.type}`),
      transitionLabel: transitionLabel(scene.transition.type),
      shots: scene.shots.length,
      cast: scene.cast.map(entry => {
        const character = characters[entry.characterId];
        const thumb = characterThumb(character, entry.lookId);
        return {
          entryId: entry.id, characterId: entry.characterId,
          name: entry.label || character?.name || "?",
          lookName: resolveLook(character, entry.lookId)?.name ?? "",
          thumb, isVideo: isVideoPath(thumb), hidden: entry.hidden
        };
      }),
      castCount: t(scene.cast.length === 1 ? "Library.Inspector.CharacterCount" : "Library.Inspector.CharactersCount",
        { count: scene.cast.length }),
      castPicker: this.#state.castPicker,
      addable: LibraryStore.list("characters").filter(c => !inCast.has(c.id)).map(c => {
        const thumb = characterThumb(c);
        return { id: c.id, name: c.name, thumb, isVideo: isVideoPath(thumb) };
      }),
      notes: scene.notes
    };
  }

  #inspectCharacter(character, live) {
    const current = resolveLook(character);
    const sprite = characterSprite(character);
    const thumb = characterThumb(character);
    const actor = character.actorUuid ? fromUuidSync(character.actorUuid, { strict: false }) : null;
    const liveScene = live.active ? LibraryStore.getScene(live.sceneId) : null;
    const owners = character.ownerIds.map(id => game.users.get(id)).filter(Boolean);
    if ( actor ) {
      for ( const user of game.users ) {
        if ( !user.isGM && actor.testUserPermission(user, "OWNER") && !owners.includes(user) ) owners.push(user);
      }
    }
    const border = character.border;
    return {
      kind: "characters",
      id: character.id,
      name: character.name,
      favorite: character.favorite,
      sprite, spriteIsVideo: isVideoPath(sprite),
      thumb, thumbIsVideo: isVideoPath(thumb),
      lookName: current?.name ?? "",
      border: {
        style: border.style, shape: border.shape, width: border.width, speed: border.speed,
        c1: border.colors[0], c2: border.colors[1], c3: border.colors[2],
        label: t(`Border.${border.style}`)
      },
      looks: character.looks.map(l => {
        const src = lookImage(l, "token");
        return { id: l.id, name: l.name, src, isVideo: isVideoPath(src), active: l.id === current?.id };
      }),
      actorName: actor?.name ?? "",
      synced: character.actorSync.enabled && !!actor,
      owners: owners.map(u => ({ name: u.name, color: u.color?.css ?? "#888" })),
      tags: character.tags,
      onStage: !!liveScene?.cast.some(e => e.characterId === character.id),
      canAddToLive: !!liveScene && !liveScene.cast.some(e => e.characterId === character.id),
      appearsIn: LibraryStore.list("scenes").filter(s => s.cast.some(e => e.characterId === character.id)).map(s => {
        const src = sceneThumb(s);
        return { id: s.id, name: s.name, thumb: src, isVideo: isVideoPath(src), live: live.active && live.sceneId === s.id };
      })
    };
  }

  #inspectDeck(deck, live) {
    const state = live.deck?.id === deck.id ? live.deck : null;
    const first = LibraryStore.getScene(deck.items[0]?.sceneId);
    const image = first ? sceneThumb(first) : "";
    return {
      kind: "decks",
      id: deck.id,
      name: deck.name,
      favorite: deck.favorite,
      image,
      isVideo: isVideoPath(image),
      running: !!state,
      playing: !!state?.playing,
      loop: deck.loop,
      runtime: formatDuration(deck.items.reduce((n, i) => n + i.duration, 0)),
      slideCount: deck.items.length,
      slides: deck.items.map((item, i) => {
        const scene = LibraryStore.getScene(item.sceneId);
        const src = scene ? (scene.backgrounds[item.step]?.src || sceneThumb(scene)) : "";
        return {
          number: i + 1, sceneId: item.sceneId, name: scene?.name ?? "?", src, isVideo: isVideoPath(src),
          duration: item.duration, active: state?.index === i
        };
      })
    };
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = () => {
      const searching = this.element?.querySelector("input[name=search]") === document.activeElement;
      this.render({ parts: searching ? ["nav", "grid", "inspector"] : ["nav", "toolbar", "grid", "inspector"] });
    };
    this.#hookIds = [
      `${MODULE_ID}.libraryChanged`, `${MODULE_ID}.liveStateChanged`, `${MODULE_ID}.previewChanged`
    ].map(name => [name, Hooks.on(name, rerender)]);
    createRecordContextMenu(this.element, ".lib-card[data-id]");
    createFolderContextMenu(this.element, "[data-folder-id][data-context=folder]");
  }

  _onClose(options) {
    super._onClose(options);
    for ( const [name, id] of this.#hookIds ) Hooks.off(name, id);
    this.#hookIds = [];
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    const parts = options.parts ?? [];

    if ( parts.includes("toolbar") ) {
      const search = html.querySelector("input[name=search]");
      search?.addEventListener("input", event => {
        this.#state.query = event.currentTarget.value;
        clearTimeout(this.#searchTimer);
        this.#searchTimer = setTimeout(() => this.render({ parts: ["grid"] }), 150);
      });
      html.querySelector("select[name=sort]")?.addEventListener("change", async event => {
        this.#state.sort = event.currentTarget.value;
        await setUiState("library.sort", this.#state.sort);
        this.render({ parts: ["grid"] });
      });
    }

    if ( parts.includes("grid") ) {
      const grid = html.querySelector(".lib-grid-part");
      activateCardDrag(grid);
      for ( const card of grid.querySelectorAll(".lib-card[data-id]") ) {
        card.addEventListener("dblclick", event => {
          if ( event.target.closest("button") ) return;
          openEditor({ kind: card.dataset.kind, id: card.dataset.id });
        });
      }
      // Folder tiles and the "up" tile move dropped records; the grid itself files into the open folder
      activateDropTargets(grid, "[data-drop-folder]", (event, target) => this.#onDropFolder(event, target.dataset.dropFolder));
      grid.addEventListener("dragover", event => event.preventDefault());
      grid.addEventListener("drop", event => this.#onDropFolder(event, this.#state.folderId ?? ""));
    }

    if ( parts.includes("nav") ) {
      const nav = html.querySelector(".lib-nav");
      activateDropTargets(nav, "[data-drop-kind]", (event, target) => {
        const data = getDragData(event);
        if ( !data ) return;
        return handleLibraryDrop(data, { kind: target.dataset.dropKind, folderId: target.dataset.dropFolder || null });
      });
      activateDropTargets(nav, "[data-drop-deck]", (event, target) => this.#onDropDeck(event, target.dataset.dropDeck));
    }

    if ( parts.includes("inspector") ) {
      const zone = html.querySelector(".cast-zone");
      if ( zone ) activateDropTargets(zone.parentElement, ".cast-zone", event => this.#onDropCast(event));
      for ( const video of html.querySelectorAll(".lib-inspector video") ) video.play?.().catch(() => {});
    }
  }

  async #onDropFolder(event, folderId) {
    event.preventDefault();
    const data = getDragData(event);
    if ( !data ) return;
    const created = await handleLibraryDrop(data, { kind: this.#state.kind, folderId: folderId || null });
    if ( created ) this.#select(created.kind, created.id);
  }

  /** Scenes dropped on a slideshow become slides. */
  async #onDropDeck(event, deckId) {
    const data = getDragData(event);
    if ( data?.type !== `${MODULE_ID}.scenes` ) return;
    await LibraryStore.update("decks", deckId, deck => {
      deck.items.push({ id: randomId(), sceneId: data.id, step: 0, duration: 10 });
    });
    ui.notifications.info(t("Library.AddedToSlideshow", {
      scene: LibraryStore.getScene(data.id)?.name ?? "", deck: LibraryStore.getDeck(deckId)?.name ?? ""
    }));
  }

  async #onDropCast(event) {
    const sceneId = this.#state.selected?.kind === "scenes" ? this.#state.selected.id : null;
    const data = getDragData(event);
    if ( !sceneId || !data ) return;
    let characterId = null;
    if ( data.type === `${MODULE_ID}.characters` ) characterId = data.id;
    else if ( data.type === "Actor" ) {
      const actor = await fromUuid(data.uuid);
      if ( !actor || actor.pack ) return;
      characterId = (await LibraryStore.createCharacterFromActor(actor)).id;
    }
    if ( characterId ) await LibraryStore.addToCast(sceneId, characterId);
  }

  /* -------------------------------------------- */
  /*  State changes                               */
  /* -------------------------------------------- */

  async #showKind(kind, { view = "all", folderId = null } = {}) {
    const changedKind = kind !== this.#state.kind;
    Object.assign(this.#state, { kind, view, folderId, castPicker: false });
    if ( changedKind ) {
      this.#state.tags = [];
      if ( this.#state.selected?.kind !== kind ) this.#state.selected = null;
    }
    this.render({ parts: ["nav", "toolbar", "grid", "inspector"] });
    await setUiState("library", {
      ...getUiState("library", {}), kind, folder: { ...getUiState("library.folder", {}), [kind]: folderId }
    });
  }

  #select(kind, id) {
    const same = this.#state.selected?.kind === kind && this.#state.selected.id === id;
    this.#state.selected = { kind, id };
    if ( !same ) {
      this.#state.step = 0;
      this.#state.castPicker = false;
    }
    const parts = ["grid", "inspector"];
    if ( kind === "decks" ) parts.push("nav");
    this.render({ parts });
  }

  /** The selected record's id if it is of the given kind. */
  #selectedId(kind) {
    return this.#state.selected?.kind === kind ? this.#state.selected.id : null;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onShowKind(event, target) {
    return this.#showKind(target.dataset.kind, { view: target.dataset.view ?? "all" });
  }

  static #onOpenFolder(event, target) {
    const kind = target.dataset.kind ?? this.#state.kind;
    return this.#showKind(kind, { folderId: target.dataset.folderId || null });
  }

  static #onSelect(event, target) {
    const card = target.closest("[data-id]");
    const kind = card.dataset.kind ?? this.#state.kind;
    if ( kind === "decks" && kind !== this.#state.kind && card.closest(".lib-nav") ) {
      this.#state.selected = { kind, id: card.dataset.id };
      return this.#showKind("decks");
    }
    this.#select(kind, card.dataset.id);
  }

  static #onDeselect() {
    this.#state.selected = null;
    this.render({ parts: ["grid", "inspector", "nav"] });
  }

  static #onFavorite(event, target) {
    const el = target.closest("[data-id]");
    return toggleFavorite(el.dataset.kind, el.dataset.id);
  }

  static async #onCreate(event, target) {
    const kind = target.dataset.kind ?? this.#state.kind;
    const folder = kind === this.#state.kind && this.#state.view === "all" ? this.#state.folderId : null;
    const record = await createRecord(kind, { folder });
    if ( kind !== this.#state.kind ) await this.#showKind(kind);
    this.#select(kind, record.id);
    openEditor({ kind, id: record.id });
  }

  static async #onCreateFolder() {
    await createFolder(this.#state.kind, this.#state.view === "all" ? this.#state.folderId : null);
  }

  static #onToggleTag(event, target) {
    const tags = new Set(this.#state.tags);
    const tag = target.dataset.tag;
    if ( tags.has(tag) ) tags.delete(tag);
    else tags.add(tag);
    this.#state.tags = [...tags];
    this.render({ parts: ["toolbar", "grid"] });
  }

  static #onClearFilters() {
    this.#state.tags = [];
    this.#state.query = "";
    this.render({ parts: ["toolbar", "grid"] });
  }

  static async #onSetLayout(event, target) {
    this.#state.layout = target.dataset.layout;
    this.render({ parts: ["toolbar", "grid"] });
    await setUiState("library.layout", this.#state.layout);
  }

  static async #onBroadcast(event, target) {
    const id = target.closest("[data-id]")?.dataset.id ?? this.#selectedId("scenes");
    if ( !id ) return;
    if ( StageDirector.preview?.sceneId === id ) await StageDirector.stopPreview();
    return LiveController.broadcast(id);
  }

  static #onStopLive() {
    return LiveController.stop();
  }

  static #onPreview(event, target) {
    const id = target.closest("[data-id]")?.dataset.id ?? this.#selectedId("scenes");
    if ( id ) return StageDirector.startPreview(id, { step: id === this.#selectedId("scenes") ? this.#state.step : 0 });
  }

  static #onEndPreview() {
    return StageDirector.stopPreview();
  }

  static #onEdit(event, target) {
    const el = target.closest("[data-id]");
    const kind = el?.dataset.kind ?? this.#state.selected?.kind;
    const id = el?.dataset.id ?? this.#state.selected?.id;
    if ( kind && id ) return openEditor({ kind, id });
  }

  static #onSetMode(event, target) {
    const id = this.#selectedId("scenes");
    if ( id ) return LibraryStore.update("scenes", id, { mode: target.dataset.mode });
  }

  static #onSetStep(event, target) {
    const id = this.#selectedId("scenes");
    const step = Number(target.dataset.index);
    this.#state.step = step;
    const live = StageDirector.live;
    if ( live.active && live.sceneId === id ) return LiveController.setStep(step);
    if ( StageDirector.preview?.sceneId === id ) return StageDirector.updatePreview({ step });
    this.render({ parts: ["inspector"] });
  }

  static async #onAddBackground() {
    const id = this.#selectedId("scenes");
    if ( !id ) return;
    const src = await pickFile({ type: "imagevideo" });
    if ( !src ) return;
    let index = 0;
    await LibraryStore.update("scenes", id, scene => {
      scene.backgrounds.push({ id: randomId(), src, name: "" });
      index = scene.backgrounds.length - 1;
    });
    this.#state.step = index;
    this.render({ parts: ["inspector"] });
  }

  static #onToggleCastPicker() {
    this.#state.castPicker = !this.#state.castPicker;
    this.render({ parts: ["inspector"] });
  }

  static async #onAddCast(event, target) {
    const id = this.#selectedId("scenes");
    if ( id ) await LibraryStore.addToCast(id, target.dataset.characterId);
  }

  static async #onRemoveCast(event, target) {
    const id = this.#selectedId("scenes");
    if ( id ) await LibraryStore.removeCastEntry(id, target.closest("[data-entry-id]").dataset.entryId);
  }

  static async #onSetLook(event, target) {
    const id = this.#selectedId("characters");
    if ( !id ) return;
    await setCurrentLook(id, target.dataset.lookId);
    Hooks.callAll(`${MODULE_ID}.lookChanged`, id, target.dataset.lookId, game.user);
  }

  static #onAddToLive() {
    const id = this.#selectedId("characters");
    const live = StageDirector.live;
    if ( id && live.active ) return LibraryStore.addToCast(live.sceneId, id);
  }

  static #onEditBorder() {
    const id = this.#selectedId("characters");
    if ( id ) return game.modules.get(MODULE_ID).api.openBorderEditor(id);
  }

  static async #onShowScene(event, target) {
    const sceneId = target.closest("[data-scene-id]").dataset.sceneId;
    const scene = LibraryStore.getScene(sceneId);
    if ( !scene ) return;
    this.#state.selected = { kind: "scenes", id: sceneId };
    this.#state.step = 0;
    await this.#showKind("scenes", { folderId: scene.folder });
  }

  static #onPlayDeck() {
    const id = this.#selectedId("decks");
    if ( !id ) return;
    const live = StageDirector.live;
    if ( live.deck?.id === id && !live.deck.playing ) return LiveController.resumeDeck();
    return LiveController.showSlide(id, 0);
  }

  static #onPauseDeck() {
    return LiveController.pauseDeck();
  }

  static #onStopDeck() {
    return LiveController.stopDeck();
  }

  static async #onImportPlayers() {
    const folder = this.#state.kind === "characters" && this.#state.view === "all" ? this.#state.folderId : null;
    const [first] = await importPlayerCharacters(folder);
    if ( !first ) return;
    if ( this.#state.kind !== "characters" ) await this.#showKind("characters", { folderId: folder });
    this.#select("characters", first.id);
  }

  static async #onSyncActor() {
    const id = this.#selectedId("characters");
    if ( id ) await ActorSync.syncCharacter(id);
  }

  static #onOpenDock() {
    return game.modules.get(MODULE_ID).api.openDock();
  }
}

/** Up to three thumbnails from a folder's contents for its tile. */
function previewThumbs(kind, node) {
  const out = [];
  const visit = n => {
    for ( const item of n.items ) {
      if ( out.length >= 3 ) return;
      const src = kind === "scenes" ? sceneThumb(item)
        : kind === "characters" ? characterThumb(item)
          : sceneThumb(LibraryStore.getScene(item.items[0]?.sceneId) ?? { backgrounds: [] });
      if ( src && !isVideoPath(src) ) out.push(src);
    }
    for ( const child of n.children ) visit(child);
  };
  visit(node);
  return out;
}

function transitionLabel(type) {
  if ( type === "none" ) return t("Transition.None");
  const config = CONFIG.Canvas.sceneTransitions?.[type];
  return config ? game.i18n.localize(config.label) : type;
}

/** Open (or focus) the library window. */
export function openLibrary() {
  const existing = foundry.applications.instances.get("immersive-library");
  if ( existing ) {
    existing.render({ force: true });
    existing.bringToFront();
    return existing;
  }
  const app = new LibraryWindow();
  app.render({ force: true });
  return app;
}

/** Toggle the library window. */
export function toggleLibrary() {
  const existing = foundry.applications.instances.get("immersive-library");
  if ( existing ) return existing.close();
  return openLibrary();
}
