/**
 * Diffing of render models (pure). The renderer uses this to animate only what changed.
 */
import { jsonEquals } from "./math.mjs";

const POSITION_KEYS = ["x", "y", "size", "z"];

/**
 * @param {object|null} prev   Previous view (see buildView)
 * @param {object|null} next   Next view
 * @returns {{
 *   kind: "none"|"start"|"stop"|"scene"|"update",
 *   modeChanged: boolean, backgroundChanged: boolean,
 *   added: object[], removed: object[],
 *   moved: object[], looks: object[], restyled: object[]
 * }}
 */
export function diffViews(prev, next) {
  const result = {
    kind: "none", modeChanged: false, backgroundChanged: false,
    added: [], removed: [], moved: [], looks: [], restyled: []
  };
  if ( !prev && !next ) return result;
  if ( !prev ) return { ...result, kind: "start", added: [...next.items] };
  if ( !next ) return { ...result, kind: "stop", removed: [...prev.items] };
  if ( prev.sceneId !== next.sceneId ) return { ...result, kind: "scene", removed: [...prev.items], added: [...next.items] };

  result.kind = "update";
  result.modeChanged = (prev.mode !== next.mode) || (prev.style !== next.style);
  result.backgroundChanged = !jsonEquals(prev.background, next.background);

  const before = new Map(prev.items.map(i => [i.id, i]));
  const after = new Map(next.items.map(i => [i.id, i]));
  for ( const [id, item] of before ) if ( !after.has(id) ) result.removed.push(item);
  for ( const [id, item] of after ) {
    const old = before.get(id);
    if ( !old ) {
      result.added.push(item);
      continue;
    }
    if ( POSITION_KEYS.some(k => old[k] !== item[k]) || (old.mirror !== item.mirror) ) result.moved.push(item);
    if ( old.src !== item.src ) result.looks.push(item);
    if ( (old.name !== item.name) || (old.showName !== item.showName) || (old.nameColor !== item.nameColor)
      || !jsonEquals(old.border, item.border) ) result.restyled.push(item);
  }
  const changed = result.modeChanged || result.backgroundChanged || result.added.length || result.removed.length
    || result.moved.length || result.looks.length || result.restyled.length;
  if ( !changed ) result.kind = "none";
  return result;
}
