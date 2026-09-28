/**
 * The only writer of the live broadcast state. Every client reacts to the resulting setting change
 * (see StageDirector). Writing requires the SETTINGS_MODIFY permission (GMs and Assistant GMs).
 */
import { MODULE_ID } from "../constants.mjs";
import { getSetting, setSetting } from "../settings.mjs";
import { normalizeLive } from "../utils/schema.mjs";
import LibraryStore from "../data/library-store.mjs";
import { canWriteLibrary } from "../data/permissions.mjs";

/** Pseudo shot id framing the whole stage. */
export const STAGE_SHOT = "stage";

export default class LiveController {
  static #queue = Promise.resolve();

  /** Current live state. */
  static get state() {
    return normalizeLive(getSetting("live"));
  }

  static get canControl() {
    return canWriteLibrary();
  }

  /** Register hooks. Called once on `ready`. */
  static init() {
    Hooks.on(`${MODULE_ID}.deleted`, (key, id) => {
      if ( key === "scenes" && this.state.sceneId === id && this.canControl ) this.stop();
    });
  }

  /**
   * Apply changes to the live state.
   * @param {object|((state: object) => object)} changes
   * @returns {Promise<object>} The new state
   */
  static update(changes) {
    const run = async () => {
      if ( !this.canControl ) throw new Error(game.i18n.localize("IMMERSIVE_SCENES.Errors.NoPermission"));
      const current = this.state;
      const delta = typeof changes === "function" ? changes(current) : changes;
      if ( !delta ) return current;
      const next = normalizeLive({ ...current, ...delta, revision: current.revision + 1, updatedBy: game.user.id });
      await setSetting("live", next);
      return next;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  /* -------------------------------------------- */
  /*  Broadcast                                   */
  /* -------------------------------------------- */

  /**
   * Broadcast a library scene to everyone.
   * @param {string} sceneId
   * @param {object} [options]
   * @param {number} [options.step=0]           Background step (sequence)
   * @param {string|null} [options.mode]        Display mode override
   * @param {object|null} [options.transition]  Transition override for this change
   * @param {boolean} [options.keepDeck=false]  Keep a running slideshow
   */
  static async broadcast(sceneId, { step = 0, mode = null, transition = null, keepDeck = false } = {}) {
    const scene = LibraryStore.getScene(sceneId);
    if ( !scene ) throw new Error(`${MODULE_ID} | Unknown scene ${sceneId}`);
    if ( Hooks.call(`${MODULE_ID}.preBroadcast`, scene, { step, mode }) === false ) return this.state;
    return this.update(state => ({
      active: true,
      sceneId,
      step,
      mode,
      shot: null,
      transition,
      deck: keepDeck ? state.deck : null
    }));
  }

  /** End the broadcast everywhere. */
  static async stop({ transition = null } = {}) {
    return this.update({ active: false, sceneId: null, step: 0, mode: null, shot: null, deck: null, transition });
  }

  /** Switch the display mode (null = the scene's own mode). */
  static async setMode(mode) {
    return this.update(state => (state.active ? { mode, transition: null } : null));
  }

  /* -------------------------------------------- */
  /*  Sequences                                   */
  /* -------------------------------------------- */

  /** Jump to a background step of the live scene. */
  static async setStep(step) {
    return this.update(state => {
      const scene = state.active ? LibraryStore.getScene(state.sceneId) : null;
      if ( !scene?.backgrounds.length ) return null;
      const count = scene.backgrounds.length;
      return { step: ((step % count) + count) % count, transition: null };
    });
  }

  static async nextStep() {
    return this.setStep(this.state.step + 1);
  }

  static async prevStep() {
    return this.setStep(this.state.step - 1);
  }

  /* -------------------------------------------- */
  /*  Slideshows                                  */
  /* -------------------------------------------- */

  /**
   * Show a slide of a deck (slideshow) and set the deck's playback state.
   * @param {string} deckId
   * @param {number} index
   * @param {object} [options]
   * @param {boolean} [options.playing=true]
   */
  static async showSlide(deckId, index, { playing = true } = {}) {
    const deck = LibraryStore.getDeck(deckId);
    const item = deck?.items[index];
    if ( !item || !LibraryStore.getScene(item.sceneId) ) return this.state;
    if ( Hooks.call(`${MODULE_ID}.preBroadcast`, LibraryStore.getScene(item.sceneId), { step: item.step, deck }) === false ) {
      return this.state;
    }
    return this.update({
      active: true,
      sceneId: item.sceneId,
      step: item.step,
      mode: null,
      shot: null,
      transition: deck.transition,
      deck: { id: deckId, index, playing, startedAt: Date.now(), elapsed: 0 }
    });
  }

  /** Pause the running slideshow, remembering how far into the slide it was. */
  static async pauseDeck() {
    return this.update(state => {
      if ( !state.deck?.playing ) return null;
      return { deck: { ...state.deck, playing: false, elapsed: Date.now() - state.deck.startedAt }, transition: null };
    });
  }

  /** Resume a paused slideshow. */
  static async resumeDeck() {
    return this.update(state => {
      if ( !state.deck || state.deck.playing ) return null;
      return { deck: { ...state.deck, playing: true, startedAt: Date.now() - state.deck.elapsed }, transition: null };
    });
  }

  /** Stop the slideshow but keep the current scene live. */
  static async stopDeck() {
    return this.update(state => (state.deck ? { deck: null, transition: null } : null));
  }

  /**
   * Go to another slide relative to the current one.
   * @param {number} delta
   */
  static async stepDeck(delta) {
    const deckState = this.state.deck;
    const deck = deckState ? LibraryStore.getDeck(deckState.id) : null;
    if ( !deck?.items.length ) return this.state;
    const count = deck.items.length;
    let index = deckState.index + delta;
    if ( index >= count || index < 0 ) {
      if ( !deck.loop ) return delta > 0 ? this.stopDeck() : this.state;
      index = ((index % count) + count) % count;
    }
    return this.showSlide(deck.id, index, { playing: deckState.playing });
  }

  /* -------------------------------------------- */
  /*  Theater                                     */
  /* -------------------------------------------- */

  /**
   * Cut every client's camera to a shot of the live scene. Players may pan away afterwards.
   * @param {string} shotId   A shot id, or "stage" for the whole stage
   */
  static async cutTo(shotId) {
    return this.update(state => {
      const scene = state.active ? LibraryStore.getScene(state.sceneId) : null;
      if ( !scene ) return null;
      if ( (shotId !== STAGE_SHOT) && !scene.shots.some(s => s.id === shotId) ) return null;
      return { shot: { id: shotId, nonce: Date.now() } };
    });
  }
}
