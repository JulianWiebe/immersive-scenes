/**
 * Resolution of library data into what the renderer draws (pure).
 */
import { computeLayout } from "./layout.mjs";

/**
 * Find the look a cast entry (or a character on its own) should show.
 * Order: entry pin → character current → character default → first look.
 * @param {object} character
 * @param {string|null} [lookId]
 * @returns {object|null}
 */
export function resolveLook(character, lookId = null) {
  if ( !character?.looks?.length ) return null;
  const byId = id => (id ? character.looks.find(l => l.id === id) : undefined);
  return byId(lookId) ?? byId(character.currentLookId) ?? byId(character.defaultLookId) ?? character.looks[0];
}

/**
 * The image to display for a look in a display mode. Token mode prefers the portrait, hero mode the
 * full-body sprite; each falls back to the other and finally to `fallback` (e.g. the linked actor image).
 * @param {object|null} look
 * @param {"hero"|"token"|"cast"} mode
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function lookImage(look, mode, fallback = "") {
  if ( !look ) return fallback;
  const first = mode === "token" ? look.portrait : look.sprite;
  const second = mode === "token" ? look.sprite : look.portrait;
  return first || second || fallback;
}

/**
 * Build the render model ("view") of the live or previewed scene.
 * @param {object} args
 * @param {object|null} args.scene          Normalized scene
 * @param {Record<string, object>} args.characters  Normalized characters by id
 * @param {number} [args.step=0]            Background (sequence) step
 * @param {string|null} [args.mode]         Mode override
 * @param {number} [args.aspect]            Frame aspect
 * @param {(character: object) => string} [args.fallbackImage]  Image for characters without looks
 * @returns {object|null}
 */
export function buildView({ scene, characters, step = 0, mode = null, aspect = 16 / 9, fallbackImage = () => "" }) {
  if ( !scene ) return null;
  const displayMode = mode ?? scene.mode;
  // Cast-Only mode draws either full-body sprites or portraits, as chosen by the scene
  const style = displayMode === "cast" ? scene.castStyle : displayMode;
  const backgrounds = scene.backgrounds;
  const stepIndex = backgrounds.length ? Math.min(Math.max(0, step), backgrounds.length - 1) : 0;
  const background = backgrounds[stepIndex] ?? null;

  const entries = scene.cast.filter(e => characters[e.characterId]);
  const looks = new Map(entries.map(e => [e.id, resolveLook(characters[e.characterId], e.lookId)]));
  const placements = computeLayout(scene.layout, entries, {
    mode: style,
    aspect,
    lookScale: e => looks.get(e.id)?.scale ?? 1
  });

  const items = [];
  for ( const entry of entries ) {
    const placement = placements.get(entry.id);
    if ( !placement ) continue;
    const character = characters[entry.characterId];
    const look = looks.get(entry.id);
    items.push({
      id: entry.id,
      characterId: character.id,
      lookId: look?.id ?? null,
      src: lookImage(look, style, fallbackImage(character)),
      x: placement.x + ((look?.offsetX ?? 0) * placement.size),
      y: placement.y + ((look?.offsetY ?? 0) * placement.size),
      size: placement.size,
      z: placement.z,
      mirror: entry.mirror !== !!look?.mirror,
      name: entry.label || character.name,
      showName: character.nameplate.show,
      nameColor: character.nameplate.color,
      border: character.border
    });
  }
  items.sort((a, b) => a.z - b.z);

  return {
    sceneId: scene.id,
    mode: displayMode,
    style,
    layoutType: scene.layout.type,
    step: stepIndex,
    stepCount: backgrounds.length,
    background: background ? { ...background } : null,
    transition: { ...scene.transition },
    entrance: { ...scene.entrance },
    items
  };
}
