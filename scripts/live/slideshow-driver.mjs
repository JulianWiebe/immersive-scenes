/**
 * Advances running slideshows. Only the active GM drives the timer; because the slide start time
 * lives in the world state, another GM takes over seamlessly if the driver disconnects.
 */
import { MODULE_ID } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import LiveController from "./live-controller.mjs";

export default class SlideshowDriver {
  static #advancing = false;

  /** Start the driver loop. Called once on `ready`. */
  static init() {
    setInterval(() => this.#tick(), 500);
    Hooks.on(`${MODULE_ID}.liveStateChanged`, () => this.#tick());
  }

  /** Remaining milliseconds of the current slide, or null if no slideshow is playing. */
  static remaining(state = LiveController.state) {
    const deck = state.deck;
    if ( !deck ) return null;
    const item = LibraryStore.getDeck(deck.id)?.items[deck.index];
    if ( !item ) return null;
    const elapsed = deck.playing ? Date.now() - deck.startedAt : deck.elapsed;
    return Math.max(0, (item.duration * 1000) - elapsed);
  }

  static async #tick() {
    if ( this.#advancing || !game.users.activeGM?.isSelf || !LiveController.canControl ) return;
    const state = LiveController.state;
    if ( !state.active || !state.deck?.playing ) return;
    const deck = LibraryStore.getDeck(state.deck.id);
    if ( !deck ) {
      await LiveController.stopDeck();
      return;
    }
    if ( this.remaining(state) > 0 ) return;
    this.#advancing = true;
    try {
      await LiveController.stepDeck(1);
    }
    finally {
      this.#advancing = false;
    }
  }
}
