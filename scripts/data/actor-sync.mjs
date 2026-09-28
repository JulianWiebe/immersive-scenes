/**
 * Keeps characters in sync with their linked actors: when an actor's name, artwork or prototype token
 * changes, or the texture of one of its linked tokens, the character and its actor look follow.
 * Only the active GM writes; everyone else just receives the library update.
 */
import LibraryStore from "./library-store.mjs";
import { canWriteLibrary } from "./permissions.mjs";
import { applyActorSync, actorSource } from "../utils/actor-sync.mjs";
import { normalizeLook } from "../utils/schema.mjs";

export default class ActorSync {
  static init() {
    Hooks.on("updateActor", (actor, changes) => {
      const relevant = ("name" in changes) || ("img" in changes)
        || foundry.utils.hasProperty(changes, "prototypeToken.texture.src");
      if ( relevant ) this.syncActor(actor);
    });
    Hooks.on("updateToken", (token, changes) => {
      if ( !foundry.utils.hasProperty(changes, "texture.src") || !token.actorLink || !token.actor ) return;
      this.syncActor(token.actor, { placedToken: token.texture.src });
    });
    // Catch up on changes made while no GM was connected
    this.syncAll();
  }

  /** Whether this client should write sync updates. */
  static get isDriver() {
    return !!game.users.activeGM?.isSelf && canWriteLibrary();
  }

  /** A factory for the look that mirrors the actor. */
  static createLook() {
    return normalizeLook({ name: game.i18n.localize("IMMERSIVE_SCENES.Look.Default") });
  }

  /**
   * Sync all characters linked to an actor.
   * @param {Actor} actor
   * @param {object} [options]   Passed to applyActorSync
   */
  static syncActor(actor, options = {}) {
    if ( !this.isDriver ) return;
    const ids = Object.values(LibraryStore.characters)
      .filter(c => c.actorSync.enabled && (c.actorUuid === actor.uuid))
      .map(c => c.id);
    return this.#write(ids, () => actorSource(actor), options);
  }

  /**
   * Sync one character now, copying every actor value (the "Sync now" button).
   * @param {string} characterId
   */
  static syncCharacter(characterId, { force = true } = {}) {
    const character = LibraryStore.getCharacter(characterId);
    const actor = character?.actorUuid ? fromUuidSync(character.actorUuid, { strict: false }) : null;
    if ( !actor ) return;
    return this.#write([characterId], () => actorSource(actor), { force });
  }

  /** Sync every synced character with its actor. */
  static syncAll() {
    if ( !this.isDriver ) return;
    const sources = new Map();
    for ( const c of Object.values(LibraryStore.characters) ) {
      if ( !c.actorSync.enabled ) continue;
      const actor = fromUuidSync(c.actorUuid, { strict: false });
      if ( actor ) sources.set(c.id, actorSource(actor));
    }
    return this.#write([...sources.keys()], id => sources.get(id), {});
  }

  /** Apply the sync to several characters in one library write, skipping the write if nothing changes. */
  static async #write(ids, sourceFor, options) {
    const opts = { createLook: () => this.createLook(), ...options };
    const changed = ids.filter(id => {
      const c = LibraryStore.getCharacter(id);
      return c && applyActorSync(c, sourceFor(id), opts);
    });
    if ( !changed.length ) return;
    await LibraryStore.mutate("characters", records => {
      for ( const id of changed ) {
        if ( !records[id] ) continue;
        const next = applyActorSync(records[id], sourceFor(id), opts);
        if ( next ) records[id] = { ...next, modified: Date.now() };
      }
    });
  }
}
