/**
 * Keeping a character in sync with its linked actor (pure).
 *
 * A synced character remembers the actor values it last applied (`actorSync.name/img/token`). A value
 * is only copied over when the actor's value differs from the remembered one, so manual edits in the
 * library survive until the actor itself changes, and re-running the sync is idempotent.
 */

/**
 * @typedef {object} ActorSource
 * @property {string} name    Actor name
 * @property {string} img     Actor artwork ("" if none or a placeholder)
 * @property {string} token   Prototype token texture ("" if none)
 */

/**
 * Apply an actor's current values to a character.
 * @param {object} character          Normalized character (not mutated)
 * @param {ActorSource} source
 * @param {object} [options]
 * @param {boolean} [options.force=false]      Copy every value, even unchanged ones (import, "sync now")
 * @param {string|null} [options.placedToken]  Texture of a placed, linked token that just changed
 * @param {() => object} [options.createLook]  Factory for a new look when the character has none from the actor
 * @returns {object|null}   The updated character, or null if nothing changed
 */
export function applyActorSync(character, source, { force = false, placedToken = null, createLook } = {}) {
  const next = structuredClone(character);
  const sync = next.actorSync;
  const img = source.img ?? "";
  const token = source.token ?? "";

  if ( force || (source.name !== sync.name) ) {
    if ( source.name ) next.name = source.name;
    sync.name = source.name;
  }

  let look = next.looks.find(l => l.fromActor);
  if ( !look ) {
    // Adopt a look that still shows the actor's images (characters imported before syncing existed)
    look = next.looks.find(l => (l.sprite === img) && (l.portrait === (token || img)) && (img || token));
    if ( !look && force && (img || token) && createLook ) {
      look = createLook();
      next.looks.unshift(look);
    }
    if ( look ) {
      look.fromActor = true;
      next.defaultLookId ??= look.id;
    }
  }

  if ( look ) {
    if ( force || (img !== sync.img) ) {
      look.sprite = img;
      if ( !token ) look.portrait = img;
    }
    if ( force || (token !== sync.token) ) look.portrait = token || img;
    if ( placedToken ) look.portrait = placedToken;
  }
  sync.img = img;
  sync.token = token;

  return JSON.stringify(next) === JSON.stringify(character) ? null : next;
}

/** Placeholder artwork that should not become a look. */
const PLACEHOLDER = /mystery-man|mystery_man|\/icons\/svg\//i;

/**
 * The values of an actor that a character follows.
 * @param {{name?: string, img?: string, prototypeToken?: {texture?: {src?: string}}}} actor
 * @returns {ActorSource}
 */
export function actorSource(actor) {
  const clean = src => (src && !PLACEHOLDER.test(src) ? src : "");
  return { name: actor?.name ?? "", img: clean(actor?.img), token: clean(actor?.prototypeToken?.texture?.src) };
}
