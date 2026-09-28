import { MODULE_ID } from "../constants.mjs";
import { getSetting, setSetting } from "../settings.mjs";
import { canWriteLibrary } from "./permissions.mjs";
import { clone } from "../utils/math.mjs";
import { randomId } from "../utils/ids.mjs";
import {
  normalizeCharacter, normalizeCollection, normalizeDeck, normalizeFolder, normalizeLook, normalizeScene
} from "../utils/schema.mjs";

const NORMALIZERS = {
  scenes: normalizeScene,
  characters: normalizeCharacter,
  folders: normalizeFolder,
  decks: normalizeDeck
};

/**
 * Read and write access to the library (scenes, characters, folders, decks).
 * Reads are normalized and cached per collection; the cache is dropped whenever the setting changes.
 * Writes are serialized so that consecutive edits never overwrite each other.
 */
export default class LibraryStore {
  static #cache = new Map();
  static #queue = Promise.resolve();

  /** Drop the cached copy of a collection (called from the setting's onChange). */
  static invalidate(key) {
    if ( key ) this.#cache.delete(key);
    else this.#cache.clear();
  }

  /**
   * A normalized, frozen collection.
   * @param {"scenes"|"characters"|"folders"|"decks"} key
   * @returns {Readonly<Record<string, object>>}
   */
  static collection(key) {
    if ( !this.#cache.has(key) ) {
      const data = normalizeCollection(clone(getSetting(key)), NORMALIZERS[key]);
      this.#cache.set(key, deepFreeze(data));
    }
    return this.#cache.get(key);
  }

  static get scenes() { return this.collection("scenes"); }
  static get characters() { return this.collection("characters"); }
  static get folders() { return this.collection("folders"); }
  static get decks() { return this.collection("decks"); }

  static getScene(id) { return this.scenes[id] ?? null; }
  static getCharacter(id) { return this.characters[id] ?? null; }
  static getDeck(id) { return this.decks[id] ?? null; }
  static getFolder(id) { return this.folders[id] ?? null; }

  /** Sorted list of a collection. */
  static list(key) {
    return Object.values(this.collection(key)).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  }

  /* -------------------------------------------- */
  /*  Writing                                     */
  /* -------------------------------------------- */

  /**
   * Apply a mutation to a collection and persist it.
   * @param {string} key
   * @param {(records: Record<string, object>) => any} mutate   Mutates a writable clone; its return value is passed on
   * @returns {Promise<any>}
   */
  static mutate(key, mutate) {
    const run = async () => {
      if ( !canWriteLibrary() ) throw new Error(game.i18n.localize("IMMERSIVE_SCENES.Errors.NoPermission"));
      const records = clone(this.collection(key));
      const result = await mutate(records);
      const normalized = normalizeCollection(records, NORMALIZERS[key]);
      await setSetting(key, normalized);
      this.invalidate(key);
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  /** Create a record. Returns the normalized record. */
  static async create(key, data = {}) {
    const record = NORMALIZERS[key]({ ...data, id: data.id ?? randomId(), sort: data.sort ?? this.#nextSort(key) });
    await this.mutate(key, records => {
      records[record.id] = record;
    });
    return this.collection(key)[record.id];
  }

  /**
   * Update a record with a partial object (shallow merge at top level; nested objects are merged one level)
   * or with a function that mutates a writable copy.
   */
  static async update(key, id, changes) {
    await this.mutate(key, records => {
      const record = records[id];
      if ( !record ) throw new Error(`${MODULE_ID} | ${key} record ${id} not found`);
      if ( typeof changes === "function" ) return changes(record);
      for ( const [k, v] of Object.entries(changes) ) {
        const isPlainObject = v && (typeof v === "object") && !Array.isArray(v);
        record[k] = isPlainObject && record[k] && (typeof record[k] === "object") && !Array.isArray(record[k])
          ? { ...record[k], ...v } : v;
      }
    });
    return this.collection(key)[id] ?? null;
  }

  static async delete(key, id) {
    await this.mutate(key, records => {
      delete records[id];
    });
    if ( key === "characters" ) await this.#removeCharacterFromScenes(id);
    if ( key === "folders" ) await this.#unfileFolder(id);
    Hooks.callAll(`${MODULE_ID}.deleted`, key, id);
  }

  static async duplicate(key, id) {
    const source = this.collection(key)[id];
    if ( !source ) return null;
    const copy = clone(source);
    copy.id = randomId();
    copy.name = game.i18n.format("IMMERSIVE_SCENES.CopyOf", { name: source.name });
    if ( key === "scenes" ) copy.favorite = false;
    return this.create(key, copy);
  }

  static #nextSort(key) {
    const sorts = Object.values(this.collection(key)).map(r => r.sort ?? 0);
    return sorts.length ? Math.max(...sorts) + 1 : 0;
  }

  static async #removeCharacterFromScenes(characterId) {
    const affected = Object.values(this.scenes).some(s => s.cast.some(e => e.characterId === characterId));
    if ( !affected ) return;
    await this.mutate("scenes", records => {
      for ( const scene of Object.values(records) ) scene.cast = scene.cast.filter(e => e.characterId !== characterId);
    });
  }

  static async #unfileFolder(folderId) {
    for ( const key of ["scenes", "characters", "decks", "folders"] ) {
      const field = key === "folders" ? "parent" : "folder";
      if ( !Object.values(this.collection(key)).some(r => r[field] === folderId) ) continue;
      await this.mutate(key, records => {
        for ( const r of Object.values(records) ) if ( r[field] === folderId ) r[field] = null;
      });
    }
  }

  /* -------------------------------------------- */
  /*  Convenience helpers                         */
  /* -------------------------------------------- */

  /** Create a character from an Actor, using its image as the first look. */
  static async createCharacterFromActor(actor) {
    const existing = Object.values(this.characters).find(c => c.actorUuid === actor.uuid);
    if ( existing ) return existing;
    const img = actor.img && !actor.img.includes("mystery-man") ? actor.img : "";
    const tokenImg = actor.prototypeToken?.texture?.src ?? "";
    const look = normalizeLook({ name: game.i18n.localize("IMMERSIVE_SCENES.Look.Default"), sprite: img, portrait: tokenImg || img });
    return this.create("characters", {
      name: actor.name,
      actorUuid: actor.uuid,
      looks: (img || tokenImg) ? [look] : [],
      defaultLookId: (img || tokenImg) ? look.id : null
    });
  }

  /** Add a character to a scene's cast. */
  static async addToCast(sceneId, characterId, data = {}) {
    let entryId = null;
    await this.update("scenes", sceneId, scene => {
      entryId = randomId();
      scene.cast.push({ x: 0.5, y: scene.mode === "hero" ? 1 : 0.5, ...data, id: entryId, characterId });
    });
    return entryId;
  }

  /** Update a single cast entry of a scene. */
  static async updateCastEntry(sceneId, entryId, changes) {
    return this.update("scenes", sceneId, scene => {
      const entry = scene.cast.find(e => e.id === entryId);
      if ( entry ) Object.assign(entry, changes);
    });
  }

  static async removeCastEntry(sceneId, entryId) {
    return this.update("scenes", sceneId, scene => {
      scene.cast = scene.cast.filter(e => e.id !== entryId);
    });
  }
}

function deepFreeze(obj) {
  if ( obj && typeof obj === "object" && !Object.isFrozen(obj) ) {
    Object.freeze(obj);
    for ( const v of Object.values(obj) ) deepFreeze(v);
  }
  return obj;
}
