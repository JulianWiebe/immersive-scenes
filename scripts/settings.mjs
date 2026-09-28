import { MODULE_ID } from "./constants.mjs";
import { normalizeLive, SCHEMA_VERSION } from "./utils/schema.mjs";

/** Keys of the world settings that hold the library. */
export const LIBRARY_KEYS = Object.freeze(["scenes", "characters", "folders", "decks"]);

/**
 * Register all module settings. Called during `init`.
 * @param {object} handlers
 * @param {(key: string) => void} handlers.onLibraryChange
 * @param {() => void} handlers.onLiveChange
 * @param {(key?: string) => void} handlers.onDisplayChange
 */
export function registerSettings({ onLibraryChange, onLiveChange, onDisplayChange }) {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);

  // Library storage: one world setting per collection so a change only re-sends that collection.
  for ( const key of LIBRARY_KEYS ) {
    register(key, {
      scope: "world",
      config: false,
      type: Object,
      default: {},
      onChange: () => onLibraryChange(key)
    });
  }

  register("live", {
    scope: "world",
    config: false,
    type: Object,
    default: normalizeLive({}),
    onChange: () => onLiveChange()
  });

  register("schemaVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: SCHEMA_VERSION
  });

  // Visible world configuration
  register("stageAspect", {
    name: "IMMERSIVE_SCENES.Settings.StageAspect.Name",
    hint: "IMMERSIVE_SCENES.Settings.StageAspect.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: { "16:9": "16:9", "21:9": "21:9", "4:3": "4:3", "3:2": "3:2", "1:1": "1:1" },
    default: "16:9",
    onChange: () => onDisplayChange("stageAspect")
  });

  register("allowPlayerLooks", {
    name: "IMMERSIVE_SCENES.Settings.AllowPlayerLooks.Name",
    hint: "IMMERSIVE_SCENES.Settings.AllowPlayerLooks.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register("allowPlayerBorders", {
    name: "IMMERSIVE_SCENES.Settings.AllowPlayerBorders.Name",
    hint: "IMMERSIVE_SCENES.Settings.AllowPlayerBorders.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register("frameOnStart", {
    name: "IMMERSIVE_SCENES.Settings.FrameOnStart.Name",
    hint: "IMMERSIVE_SCENES.Settings.FrameOnStart.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Client preferences
  register("reduceMotion", {
    name: "IMMERSIVE_SCENES.Settings.ReduceMotion.Name",
    hint: "IMMERSIVE_SCENES.Settings.ReduceMotion.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => onDisplayChange()
  });

  register("backgroundVolume", {
    name: "IMMERSIVE_SCENES.Settings.BackgroundVolume.Name",
    hint: "IMMERSIVE_SCENES.Settings.BackgroundVolume.Hint",
    scope: "client",
    config: true,
    type: new foundry.data.fields.NumberField({ min: 0, max: 1, step: 0.05, initial: 1 }),
    default: 1,
    onChange: () => onDisplayChange()
  });

  register("autoOpenDock", {
    name: "IMMERSIVE_SCENES.Settings.AutoOpenDock.Name",
    hint: "IMMERSIVE_SCENES.Settings.AutoOpenDock.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  register("uiState", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

/** Read a module setting. */
export const getSetting = key => game.settings.get(MODULE_ID, key);

/** Write a module setting. */
export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);

/** Whether animations should be skipped on this client. */
export function reducedMotion() {
  return !!getSetting("reduceMotion") || !!canvas?.photosensitiveMode
    || !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
