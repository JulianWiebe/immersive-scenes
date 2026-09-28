/**
 * Scene editing operations shared by the scene editor, the live dock and on-canvas editing.
 */
import LibraryStore from "./library-store.mjs";
import { getSetting } from "../settings.mjs";
import { computeLayout, materialize } from "../utils/layout.mjs";
import { parseAspect } from "../utils/frame.mjs";

/**
 * Convert a slot layout (row, column, grid) into a freeform one, storing everybody's current position.
 * Mutates the given writable scene record.
 * @param {object} scene
 * @param {"free"|"theater"} [type="free"]
 * @returns {boolean} Whether the layout changed
 */
export function freezeLayout(scene, type = "free") {
  if ( ["free", "theater"].includes(scene.layout.type) ) return false;
  const style = scene.mode === "cast" ? scene.castStyle : scene.mode;
  const aspect = parseAspect(getSetting("stageAspect"));
  const placements = computeLayout(scene.layout, scene.cast, { mode: style, aspect });
  scene.cast = materialize(scene.cast, placements);
  scene.layout.type = type;
  return true;
}

/**
 * Move a cast member by a delta in frame fractions, freezing slot layouts first.
 * @param {string} sceneId
 * @param {string} entryId
 * @param {{dx: number, dy: number}} delta
 */
export function moveCastEntry(sceneId, entryId, { dx, dy }) {
  return LibraryStore.update("scenes", sceneId, scene => {
    freezeLayout(scene);
    const entry = scene.cast.find(e => e.id === entryId);
    if ( !entry ) return;
    entry.x = round(entry.x + dx);
    entry.y = round(entry.y + dy);
  });
}

/** Multiply a cast member's scale. */
export function scaleCastEntry(sceneId, entryId, factor) {
  return LibraryStore.update("scenes", sceneId, scene => {
    const entry = scene.cast.find(e => e.id === entryId);
    if ( entry ) entry.scale = Math.min(10, Math.max(0.05, round(entry.scale * factor)));
  });
}

/** Toggle a boolean field of a cast entry. */
export function toggleCastEntry(sceneId, entryId, field) {
  return LibraryStore.update("scenes", sceneId, scene => {
    const entry = scene.cast.find(e => e.id === entryId);
    if ( entry ) entry[field] = !entry[field];
  });
}

/** Move a cast entry forward (+1) or backward (-1) in draw order. */
export function restackCastEntry(sceneId, entryId, direction) {
  return LibraryStore.update("scenes", sceneId, scene => {
    const entry = scene.cast.find(e => e.id === entryId);
    if ( !entry ) return;
    const zs = scene.cast.map((e, i) => e.z ?? i);
    const current = entry.z ?? scene.cast.indexOf(entry);
    entry.z = direction > 0 ? Math.max(...zs, current) + 1 : Math.min(...zs, current) - 1;
  });
}

/** Set which look a character currently wears (GM direct write). */
export function setCurrentLook(characterId, lookId) {
  return LibraryStore.update("characters", characterId, { currentLookId: lookId });
}

const round = v => Math.round(v * 10000) / 10000;
