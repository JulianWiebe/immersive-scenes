/**
 * Filename parsing for bulk look imports (pure).
 *
 * Supported patterns (extension and case ignored):
 *   Aria.webp                      → character "Aria", look "Default"
 *   Aria_battle-armor.webp         → character "Aria", look "Battle Armor"
 *   Aria - Battle Armor.png        → character "Aria", look "Battle Armor"
 *   Aria_battle-armor_portrait.png → same look, used as portrait (token mode)
 *   Aria_battle-armor_full.webm    → same look, used as full-body sprite (hero mode)
 */

const PORTRAIT_SUFFIXES = ["portrait", "token", "face", "bust", "avatar"];
const SPRITE_SUFFIXES = ["full", "body", "sprite", "hero", "fullbody"];

/** "battle-armor" → "Battle Armor" */
export function humanize(text) {
  return String(text ?? "")
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Parse a file path.
 * @param {string} path
 * @returns {{character: string, look: string, kind: "portrait"|"sprite"|null, src: string}}
 */
export function parseLookFilename(path) {
  const file = decodeURIComponent(String(path).split(/[\\/]/).pop() ?? "");
  const stem = file.replace(/\.[^.]+$/, "");
  let parts = stem.includes(" - ") ? stem.split(" - ") : stem.split("_");
  parts = parts.map(p => p.trim()).filter(Boolean);

  let kind = null;
  const last = parts.at(-1)?.toLowerCase();
  if ( parts.length > 1 && PORTRAIT_SUFFIXES.includes(last) ) kind = "portrait";
  else if ( parts.length > 1 && SPRITE_SUFFIXES.includes(last) ) kind = "sprite";
  if ( kind ) parts.pop();

  const character = humanize(parts[0] ?? stem);
  const look = parts.length > 1 ? humanize(parts.slice(1).join(" ")) : "Default";
  return { character, look, kind, src: path };
}

/**
 * Group files into characters → looks, pairing portrait and full-body variants of the same look.
 * Files without an explicit kind fill whichever slot is still empty (sprite first).
 * @param {string[]} paths
 * @returns {Map<string, Map<string, {name: string, portrait: string, sprite: string}>>}
 */
export function groupLookFiles(paths) {
  const characters = new Map();
  const parsed = paths.map(parseLookFilename);
  // Explicit kinds first so untyped files only fill gaps
  parsed.sort((a, b) => (a.kind ? 0 : 1) - (b.kind ? 0 : 1));
  for ( const { character, look, kind, src } of parsed ) {
    if ( !characters.has(character) ) characters.set(character, new Map());
    const looks = characters.get(character);
    if ( !looks.has(look) ) looks.set(look, { name: look, portrait: "", sprite: "" });
    const entry = looks.get(look);
    if ( kind === "portrait" ) entry.portrait ||= src;
    else if ( kind === "sprite" ) entry.sprite ||= src;
    else if ( !entry.sprite ) entry.sprite = src;
    else entry.portrait ||= src;
  }
  return characters;
}
