/**
 * Shared helpers for the module's applications.
 */
import { MODULE_ID } from "../constants.mjs";
import { getSetting } from "../settings.mjs";

const { DialogV2 } = foundry.applications.api;

/** Escape text for HTML. */
export const escape = text => foundry.utils.escapeHTML(String(text ?? ""));

/** Localize a key of this module. */
export const t = (key, data) => (data ? game.i18n.format(`IMMERSIVE_SCENES.${key}`, data) : game.i18n.localize(`IMMERSIVE_SCENES.${key}`));

/**
 * Ask for a single line of text.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.label
 * @param {string} [options.value=""]
 * @returns {Promise<string|null>}
 */
export async function promptText({ title, label, value = "" }) {
  const result = await DialogV2.input({
    window: { title },
    content: `<div class="form-group"><label>${escape(label)}</label>
      <div class="form-fields"><input type="text" name="value" value="${escape(value)}" autofocus></div></div>`,
    ok: { label: "IMMERSIVE_SCENES.Actions.Save" },
    rejectClose: false
  });
  const text = result?.value?.trim();
  return text || null;
}

/**
 * Confirm a deletion.
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function confirmDelete(name) {
  return !!(await DialogV2.confirm({
    window: { title: t("Actions.Delete") },
    content: `<p>${t("Dialogs.ConfirmDelete", { name: escape(name) })}</p>`,
    rejectClose: false
  }));
}

/**
 * Open a FilePicker and resolve with the chosen path.
 * @param {object} [options]
 * @param {"image"|"video"|"imagevideo"|"folder"} [options.type="imagevideo"]
 * @param {string} [options.current]
 * @returns {Promise<string|null>}
 */
export function pickFile({ type = "imagevideo", current = "" } = {}) {
  return new Promise(resolve => {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const picker = new FilePicker({
      type,
      current,
      callback: path => resolve(path)
    });
    picker.addEventListener?.("close", () => resolve(null), { once: true });
    picker.render({ force: true });
  });
}

/** Read persistent UI state (client scope). */
export function getUiState(key, fallback) {
  return foundry.utils.getProperty(getSetting("uiState") ?? {}, key) ?? fallback;
}

/** Write persistent UI state (client scope). */
export async function setUiState(key, value) {
  const state = foundry.utils.deepClone(getSetting("uiState") ?? {});
  foundry.utils.setProperty(state, key, value);
  await game.settings.set(MODULE_ID, "uiState", state);
}

/** Whether a path is a video. */
export function isVideoPath(src) {
  return foundry.helpers.media.VideoHelper.hasVideoExtension(src);
}

/** Thumbnail image for a scene: explicit thumb, else the first background. */
export function sceneThumb(scene) {
  return scene.thumb || scene.backgrounds.find(b => b.src)?.src || "";
}

/**
 * Parse a comma separated tag string.
 * @param {string} text
 * @returns {string[]}
 */
export function parseTags(text) {
  return [...new Set(String(text ?? "").split(",").map(s => s.trim()).filter(Boolean))];
}

/**
 * Read drag data from a drop event.
 * @param {DragEvent} event
 * @returns {object|null}
 */
export function getDragData(event) {
  try {
    return foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  }
  catch {
    return null;
  }
}

/**
 * Sort a list of records by index path keys produced by form data (e.g. {"0": {...}, "1": {...}}).
 * @param {object|Array} value
 * @returns {object[]}
 */
export function indexedToArray(value) {
  if ( Array.isArray(value) ) return value;
  return Object.entries(value ?? {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v);
}
