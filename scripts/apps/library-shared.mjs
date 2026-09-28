/**
 * Library logic shared by the sidebar tab and the library window: record decoration for cards,
 * context menus, folder creation and drop handling.
 */
import { MODULE_ID } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "../live/live-controller.mjs";
import StageDirector from "../canvas/director.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { t, promptText, confirmDelete, sceneThumb, isVideoPath } from "./helpers.mjs";

export const KINDS = {
  scenes: { collection: "scenes", folderType: "scene", icon: "fa-solid fa-image" },
  characters: { collection: "characters", folderType: "character", icon: "fa-solid fa-user" },
  decks: { collection: "decks", folderType: "deck", icon: "fa-solid fa-film" }
};

export const MODE_ICONS = { token: "fa-solid fa-circle-user", hero: "fa-solid fa-person", cast: "fa-solid fa-layer-group" };

/** Open the editor for a library record. */
export function openEditor({ kind, id }) {
  const api = game.modules.get(MODULE_ID).api;
  if ( kind === "scenes" ) return api.editScene(id);
  if ( kind === "characters" ) return api.editCharacter(id);
  if ( kind === "decks" ) return api.editDeck?.(id);
}

/** The image of a character's linked actor, if any. */
export function actorImage(character) {
  if ( !character?.actorUuid ) return "";
  return fromUuidSync(character.actorUuid, { strict: false })?.img ?? "";
}

/** Portrait (token) image of a character's current look, falling back to the actor. */
export function characterThumb(character, lookId = null) {
  return lookImage(resolveLook(character, lookId), "token") || actorImage(character);
}

/** Full-body image of a character's current look, falling back to the portrait. */
export function characterSprite(character, lookId = null) {
  return lookImage(resolveLook(character, lookId), "hero") || characterThumb(character, lookId);
}

/**
 * Data for rendering a library record as a card or list row.
 * @param {"scenes"|"characters"|"decks"} kind
 * @param {object} record
 * @param {object} live     Current live state
 * @returns {object}
 */
export function decorateRecord(kind, record, live) {
  const tags = record.tags ?? [];
  const base = {
    id: record.id,
    kind,
    name: record.name,
    tags,
    shownTags: tags.slice(0, 3),
    moreTags: Math.max(0, tags.length - 3),
    searchTags: tags.join(",").toLowerCase(),
    favorite: !!record.favorite,
    folderName: record.folder ? LibraryStore.getFolder(record.folder)?.name ?? "" : ""
  };
  if ( kind === "scenes" ) {
    const thumb = sceneThumb(record);
    return {
      ...base,
      thumb,
      isVideo: isVideoPath(thumb),
      mode: record.mode,
      modeIcon: MODE_ICONS[record.mode],
      modeLabel: t(`Mode.${record.mode}`),
      live: live.active && live.sceneId === record.id,
      steps: record.backgrounds.length > 1 ? record.backgrounds.length : 0,
      castCount: record.cast.length
    };
  }
  if ( kind === "characters" ) {
    const thumb = characterThumb(record);
    const sprite = characterSprite(record);
    const liveScene = live.active ? LibraryStore.getScene(live.sceneId) : null;
    return {
      ...base,
      thumb,
      isVideo: isVideoPath(thumb),
      sprite,
      spriteIsVideo: isVideoPath(sprite),
      looks: record.looks.length,
      linked: !!record.actorUuid,
      onStage: !!liveScene?.cast.some(e => e.characterId === record.id),
      round: true
    };
  }
  const first = LibraryStore.getScene(record.items[0]?.sceneId);
  const thumb = first ? sceneThumb(first) : "";
  const seconds = record.items.reduce((n, i) => n + i.duration, 0);
  return {
    ...base,
    thumb,
    isVideo: isVideoPath(thumb),
    slides: record.items.length,
    runtime: formatDuration(seconds),
    playing: live.deck?.id === record.id,
    live: live.deck?.id === record.id
  };
}

/** Format seconds as m:ss. */
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Flip a record's favorite flag. */
export function toggleFavorite(kind, id) {
  const { collection } = KINDS[kind];
  const record = LibraryStore.collection(collection)[id];
  if ( record ) return LibraryStore.update(collection, id, { favorite: !record.favorite });
}

/** Ask for a name and create a folder. Returns the folder or null. */
export async function createFolder(kind, parent = null) {
  const name = await promptText({ title: t("Actions.CreateFolder"), label: t("Fields.Name") });
  if ( !name ) return null;
  return LibraryStore.create("folders", { name, parent, type: KINDS[kind].folderType });
}

/** Create a record with a default name. Returns the record. */
export function createRecord(kind, data = {}) {
  return LibraryStore.create(KINDS[kind].collection, { name: t(`Library.New.${kind}`), ...data });
}

/**
 * Context menu for record cards. Cards need `data-kind` and `data-id`.
 * @param {HTMLElement} element
 * @param {string} selector
 */
export function createRecordContextMenu(element, selector) {
  const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
  const scene = li => li.dataset.kind === "scenes";
  const menu = [
    { label: "IMMERSIVE_SCENES.Actions.Broadcast", icon: "fa-solid fa-tower-broadcast", visible: scene,
      onClick: (e, li) => LiveController.broadcast(li.dataset.id) },
    { label: "IMMERSIVE_SCENES.Actions.Preview", icon: "fa-solid fa-eye", visible: scene,
      onClick: (e, li) => StageDirector.startPreview(li.dataset.id) },
    { label: "IMMERSIVE_SCENES.Actions.Play", icon: "fa-solid fa-play", visible: li => li.dataset.kind === "decks",
      onClick: (e, li) => LiveController.showSlide(li.dataset.id, 0) },
    { label: "IMMERSIVE_SCENES.Actions.Edit", icon: "fa-solid fa-pen-to-square",
      onClick: (e, li) => openEditor({ kind: li.dataset.kind, id: li.dataset.id }) },
    { label: "IMMERSIVE_SCENES.Actions.ToggleFavorite", icon: "fa-solid fa-star",
      onClick: (e, li) => toggleFavorite(li.dataset.kind, li.dataset.id) },
    { label: "IMMERSIVE_SCENES.Actions.AddToLive", icon: "fa-solid fa-user-plus",
      visible: li => li.dataset.kind === "characters" && StageDirector.live.active,
      onClick: (e, li) => LibraryStore.addToCast(StageDirector.live.sceneId, li.dataset.id) },
    { label: "IMMERSIVE_SCENES.Actions.Duplicate", icon: "fa-solid fa-copy",
      onClick: (e, li) => LibraryStore.duplicate(KINDS[li.dataset.kind].collection, li.dataset.id) },
    { label: "IMMERSIVE_SCENES.Actions.RemoveFromFolder", icon: "fa-solid fa-folder-minus",
      visible: li => !!LibraryStore.collection(KINDS[li.dataset.kind].collection)[li.dataset.id]?.folder,
      onClick: (e, li) => LibraryStore.update(KINDS[li.dataset.kind].collection, li.dataset.id, { folder: null }) },
    { label: "IMMERSIVE_SCENES.Actions.Delete", icon: "fa-solid fa-trash",
      onClick: async (e, li) => {
        const { collection } = KINDS[li.dataset.kind];
        const r = LibraryStore.collection(collection)[li.dataset.id];
        if ( r && await confirmDelete(r.name) ) await LibraryStore.delete(collection, r.id);
      } }
  ];
  return new ContextMenu(element, selector, menu, { jQuery: false, fixed: true });
}

/**
 * Context menu for folders. Folder elements need `data-folder-id`.
 * @param {HTMLElement} element
 * @param {string} selector
 * @param {(folderId: string) => any} [onCreated]   Called with the parent id after a subfolder was created
 */
export function createFolderContextMenu(element, selector, onCreated) {
  const ContextMenu = foundry.applications.ux.ContextMenu.implementation;
  const folderOf = li => LibraryStore.getFolder(li.dataset.folderId);
  const kindOf = folder => Object.keys(KINDS).find(k => KINDS[k].folderType === folder.type);
  const menu = [
    { label: "IMMERSIVE_SCENES.Actions.Rename", icon: "fa-solid fa-i-cursor",
      onClick: async (e, li) => {
        const folder = folderOf(li);
        const name = await promptText({ title: t("Actions.Rename"), label: t("Fields.Name"), value: folder.name });
        if ( name ) await LibraryStore.update("folders", folder.id, { name });
      } },
    { label: "IMMERSIVE_SCENES.Actions.CreateSubfolder", icon: "fa-solid fa-folder-plus",
      onClick: async (e, li) => {
        const folder = folderOf(li);
        if ( await createFolder(kindOf(folder), folder.id) ) onCreated?.(folder.id);
      } },
    { label: "IMMERSIVE_SCENES.Actions.Delete", icon: "fa-solid fa-trash",
      onClick: async (e, li) => {
        const folder = folderOf(li);
        if ( folder && await confirmDelete(folder.name) ) await LibraryStore.delete("folders", folder.id);
      } }
  ];
  return new ContextMenu(element, selector, menu, { jQuery: false, fixed: true });
}

/**
 * Handle data dropped onto a library view.
 * - Library records of the viewed kind move into the target folder.
 * - Actors become characters.
 * - Tiles and images become scenes.
 * @param {object} data           Drag data
 * @param {object} target
 * @param {string} target.kind    The kind being viewed
 * @param {string|null} target.folderId
 * @returns {Promise<{kind: string, id: string}|null>}   A record that was created, if any
 */
export async function handleLibraryDrop(data, { kind, folderId = null }) {
  const [ns, dataKind] = String(data.type ?? "").split(".");
  if ( ns === MODULE_ID && KINDS[dataKind] ) {
    if ( dataKind !== kind ) return null;
    const folder = folderId ? LibraryStore.getFolder(folderId) : null;
    if ( folder && folder.type !== KINDS[kind].folderType ) return null;
    await LibraryStore.update(KINDS[kind].collection, data.id, { folder: folderId });
    return null;
  }

  if ( data.type === "Actor" ) {
    const actor = await fromUuid(data.uuid);
    if ( !actor ) return null;
    if ( actor.pack ) {
      ui.notifications.warn("IMMERSIVE_SCENES.Warnings.CompendiumActor", { localize: true });
      return null;
    }
    const character = await LibraryStore.createCharacterFromActor(actor);
    if ( folderId && kind === "characters" ) await LibraryStore.update("characters", character.id, { folder: folderId });
    return { kind: "characters", id: character.id };
  }

  const src = data.texture?.src ?? data.src ?? null;
  if ( src && kind === "scenes" ) {
    const name = decodeURIComponent(src.split("/").pop().replace(/\.[^.]+$/, ""));
    const scene = await LibraryStore.create("scenes", { name, folder: folderId, backgrounds: [{ src }] });
    return { kind: "scenes", id: scene.id };
  }
  return null;
}

/** Make library cards draggable as `immersive-scenes.<kind>` records. */
export function activateCardDrag(root, selector = "[data-kind][data-id][draggable=true]") {
  for ( const card of root.querySelectorAll(selector) ) {
    card.addEventListener("dragstart", event => {
      const data = { type: `${MODULE_ID}.${card.dataset.kind}`, id: card.dataset.id };
      event.dataTransfer.setData("text/plain", JSON.stringify(data));
      event.dataTransfer.effectAllowed = "copyMove";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  }
}

/**
 * Highlight drop targets while something is dragged over them.
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {(event: DragEvent, target: HTMLElement) => any} onDrop
 */
export function activateDropTargets(root, selector, onDrop) {
  for ( const target of root.querySelectorAll(selector) ) {
    let depth = 0;
    target.addEventListener("dragenter", event => {
      event.preventDefault();
      depth++;
      target.classList.add("drag-over");
    });
    target.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if ( !depth ) target.classList.remove("drag-over");
    });
    target.addEventListener("dragover", event => event.preventDefault());
    target.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      depth = 0;
      target.classList.remove("drag-over");
      onDrop(event, target);
    });
  }
}
