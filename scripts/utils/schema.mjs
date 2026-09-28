/**
 * Pure normalizers for everything the module stores. They turn arbitrary (possibly partial or outdated)
 * data into complete, valid records, so the rest of the code can rely on every field being present.
 * No Foundry globals are used here, which keeps the data layer unit-testable.
 */
import { randomId } from "./ids.mjs";
import { clamp } from "./math.mjs";

export const SCHEMA_VERSION = 1;

const MODES = ["token", "hero", "cast"];
const LAYOUTS = ["row", "column", "grid", "free", "theater"];
const ANCHORS = ["bottom", "top", "left", "right", "center"];
const FITS = ["cover", "contain", "stretch"];
const BORDER_STYLES = ["none", "solid", "double", "gradient", "spin", "pulse", "rainbow", "flame"];
const BORDER_SHAPES = ["circle", "rounded", "square"];
const ENTRANCES = ["fade", "slide", "rise", "zoom", "none"];
const FOLDER_TYPES = ["scene", "character", "deck"];
const COLOR = /^#[0-9a-f]{6}$/i;

const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const nullableStr = v => ((typeof v === "string") && v.length ? v : null);
const bool = (v, fallback = false) => (typeof v === "boolean" ? v : fallback);
const oneOf = (v, list, fallback = list[0]) => (list.includes(v) ? v : fallback);
const color = (v, fallback) => (COLOR.test(v ?? "") ? v.toLowerCase() : fallback);
const id = v => ((typeof v === "string") && /^[A-Za-z0-9]{1,32}$/.test(v) ? v : randomId());
const strList = v => (Array.isArray(v) ? [...new Set(v.filter(s => typeof s === "string" && s.trim()).map(s => s.trim()))] : []);
const num = (v, fallback) => (Number.isFinite(Number(v)) && (v !== null) && (v !== "") ? Number(v) : fallback);

/** Ensure ids inside an array are unique, regenerating duplicates. */
function uniqueIds(list) {
  const seen = new Set();
  for ( const item of list ) {
    while ( seen.has(item.id) ) item.id = randomId();
    seen.add(item.id);
  }
  return list;
}

/* -------------------------------------------- */
/*  Characters                                  */
/* -------------------------------------------- */

export function normalizeLook(raw = {}) {
  return {
    id: id(raw.id),
    name: str(raw.name, "Default").trim() || "Default",
    portrait: str(raw.portrait),
    sprite: str(raw.sprite),
    scale: clamp(raw.scale, 0.05, 10, 1),
    offsetX: clamp(raw.offsetX, -1, 1, 0),
    offsetY: clamp(raw.offsetY, -1, 1, 0),
    mirror: bool(raw.mirror)
  };
}

export function normalizeBorder(raw = {}) {
  const colors = Array.isArray(raw.colors) ? raw.colors : [];
  const defaults = ["#d4af37", "#8a5cf6", "#1fb5c9"];
  return {
    style: oneOf(raw.style, BORDER_STYLES, "solid"),
    colors: defaults.map((c, i) => color(colors[i], c)),
    width: clamp(raw.width, 0.01, 0.25, 0.06),
    speed: clamp(raw.speed, 0, 5, 1),
    shape: oneOf(raw.shape, BORDER_SHAPES, "circle")
  };
}

export function normalizeCharacter(raw = {}) {
  const looks = uniqueIds((Array.isArray(raw.looks) ? raw.looks : []).map(normalizeLook));
  const ids = new Set(looks.map(l => l.id));
  const pick = v => (ids.has(v) ? v : null);
  return {
    id: id(raw.id),
    name: str(raw.name, "New Character").trim() || "New Character",
    folder: nullableStr(raw.folder),
    tags: strList(raw.tags),
    sort: num(raw.sort, 0),
    actorUuid: nullableStr(raw.actorUuid),
    ownerIds: strList(raw.ownerIds),
    looks,
    currentLookId: pick(raw.currentLookId),
    defaultLookId: pick(raw.defaultLookId),
    border: normalizeBorder(raw.border ?? {}),
    nameplate: {
      show: bool(raw.nameplate?.show, true),
      color: color(raw.nameplate?.color, "#ffffff")
    }
  };
}

/* -------------------------------------------- */
/*  Scenes                                      */
/* -------------------------------------------- */

export function normalizeBackground(raw = {}) {
  return {
    id: id(raw.id),
    name: str(raw.name),
    src: str(raw.src),
    fit: oneOf(raw.fit, FITS, "cover"),
    color: color(raw.color, "#000000"),
    loop: bool(raw.loop, true),
    volume: clamp(raw.volume, 0, 1, 0)
  };
}

export function normalizeCastEntry(raw = {}) {
  return {
    id: id(raw.id),
    characterId: str(raw.characterId),
    lookId: nullableStr(raw.lookId),
    x: clamp(raw.x, -0.5, 1.5, 0.5),
    y: clamp(raw.y, -0.5, 1.5, 1),
    scale: clamp(raw.scale, 0.05, 10, 1),
    mirror: bool(raw.mirror),
    z: (raw.z === null || raw.z === undefined || raw.z === "") ? null : num(raw.z, null),
    hidden: bool(raw.hidden),
    label: str(raw.label)
  };
}

export function normalizeShot(raw = {}) {
  return {
    id: id(raw.id),
    name: str(raw.name, "Shot").trim() || "Shot",
    x: clamp(raw.x, -0.5, 1.5, 0.5),
    y: clamp(raw.y, -0.5, 1.5, 0.5),
    zoom: clamp(raw.zoom, 0.05, 4, 1),
    duration: clamp(raw.duration, 0, 20000, 1200),
    easing: str(raw.easing, "easeInOutCosine") || "easeInOutCosine"
  };
}

export function normalizeLayout(raw = {}) {
  return {
    type: oneOf(raw.type, LAYOUTS, "row"),
    rows: Math.round(clamp(raw.rows, 0, 12, 0)),
    columns: Math.round(clamp(raw.columns, 0, 12, 0)),
    anchor: oneOf(raw.anchor, ANCHORS, "bottom"),
    spacing: clamp(raw.spacing, 0.02, 1, 0.22),
    margin: clamp(raw.margin, 0, 0.4, 0.04),
    heroSize: clamp(raw.heroSize, 0.1, 2, 0.85),
    tokenSize: clamp(raw.tokenSize, 0.05, 1, 0.28),
    depth: clamp(raw.depth, 0, 0.95, 0.5)
  };
}

export function normalizeTransition(raw = {}, fallbackType = "fade", fallbackDuration = 1000) {
  return {
    type: str(raw.type, fallbackType) || fallbackType,
    duration: clamp(raw.duration, 0, 20000, fallbackDuration)
  };
}

export function normalizeScene(raw = {}) {
  const backgrounds = uniqueIds((Array.isArray(raw.backgrounds) ? raw.backgrounds : []).map(normalizeBackground));
  return {
    id: id(raw.id),
    name: str(raw.name, "New Scene").trim() || "New Scene",
    folder: nullableStr(raw.folder),
    tags: strList(raw.tags),
    favorite: bool(raw.favorite),
    sort: num(raw.sort, 0),
    thumb: str(raw.thumb),
    mode: oneOf(raw.mode, MODES, "hero"),
    castStyle: oneOf(raw.castStyle, ["hero", "token"], "hero"),
    backgrounds,
    layout: normalizeLayout(raw.layout ?? {}),
    cast: uniqueIds((Array.isArray(raw.cast) ? raw.cast : []).map(normalizeCastEntry).filter(e => e.characterId)),
    shots: uniqueIds((Array.isArray(raw.shots) ? raw.shots : []).map(normalizeShot)),
    transition: normalizeTransition(raw.transition ?? {}, "fade", 1000),
    entrance: {
      type: oneOf(raw.entrance?.type, ENTRANCES, "fade"),
      duration: clamp(raw.entrance?.duration, 0, 10000, 600)
    },
    notes: str(raw.notes)
  };
}

/* -------------------------------------------- */
/*  Folders & Decks                             */
/* -------------------------------------------- */

export function normalizeFolder(raw = {}) {
  return {
    id: id(raw.id),
    name: str(raw.name, "New Folder").trim() || "New Folder",
    type: oneOf(raw.type, FOLDER_TYPES, "scene"),
    parent: nullableStr(raw.parent),
    color: color(raw.color, ""),
    sort: num(raw.sort, 0)
  };
}

export function normalizeDeckItem(raw = {}) {
  return {
    id: id(raw.id),
    sceneId: str(raw.sceneId),
    step: Math.round(clamp(raw.step, 0, 999, 0)),
    duration: clamp(raw.duration, 1, 3600, 10)
  };
}

export function normalizeDeck(raw = {}) {
  return {
    id: id(raw.id),
    name: str(raw.name, "New Slideshow").trim() || "New Slideshow",
    folder: nullableStr(raw.folder),
    sort: num(raw.sort, 0),
    items: uniqueIds((Array.isArray(raw.items) ? raw.items : []).map(normalizeDeckItem).filter(i => i.sceneId)),
    loop: bool(raw.loop, true),
    transition: raw.transition ? normalizeTransition(raw.transition, "fade", 1000) : null
  };
}

/* -------------------------------------------- */
/*  Live state                                  */
/* -------------------------------------------- */

export function normalizeLive(raw = {}) {
  const shot = raw.shot && typeof raw.shot === "object" && raw.shot.id
    ? { id: str(raw.shot.id), nonce: num(raw.shot.nonce, 0) } : null;
  const deck = raw.deck && typeof raw.deck === "object" && raw.deck.id
    ? {
      id: str(raw.deck.id),
      index: Math.max(0, Math.round(num(raw.deck.index, 0))),
      playing: bool(raw.deck.playing),
      startedAt: num(raw.deck.startedAt, 0),
      elapsed: Math.max(0, num(raw.deck.elapsed, 0))
    } : null;
  const active = bool(raw.active) && !!nullableStr(raw.sceneId);
  return {
    active,
    sceneId: active ? raw.sceneId : null,
    step: Math.max(0, Math.round(num(raw.step, 0))),
    mode: MODES.includes(raw.mode) ? raw.mode : null,
    shot,
    deck,
    transition: raw.transition && typeof raw.transition === "object" ? normalizeTransition(raw.transition) : null,
    revision: Math.max(0, Math.round(num(raw.revision, 0))),
    updatedBy: nullableStr(raw.updatedBy)
  };
}

/**
 * Normalize a whole record collection (`Record<id, T>`), keying each record by its (possibly regenerated) id.
 * Accepts arrays too.
 * @template T
 * @param {object|Array} raw
 * @param {(raw: object) => T} normalize
 * @returns {Record<string, T>}
 */
export function normalizeCollection(raw, normalize) {
  const out = {};
  const values = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  for ( const value of values ) {
    if ( !value || typeof value !== "object" ) continue;
    const record = normalize(value);
    while ( out[record.id] ) record.id = randomId();
    out[record.id] = record;
  }
  return out;
}
