/** The module id, used for settings, flags, sockets, queries and template paths. */
export const MODULE_ID = "immersive-scenes";

/** Prefix of every localization key. */
export const I18N = "IMMERSIVE_SCENES";

/** Socket channel for transient traffic (drag previews). */
export const SOCKET = `module.${MODULE_ID}`;

/** Key of the sidebar tab. Must be camelCase without hyphens (Sidebar#changeTab relies on \w). */
export const SIDEBAR_TAB = "immersiveScenes";

/** Resolve a template path inside the module. */
export const template = path => `modules/${MODULE_ID}/templates/${path}`;

/** Display modes of an immersive scene. */
export const MODES = Object.freeze({
  TOKEN: "token",
  HERO: "hero",
  CAST: "cast"
});

/** Cast layout types. */
export const LAYOUTS = Object.freeze({
  ROW: "row",
  COLUMN: "column",
  GRID: "grid",
  FREE: "free",
  THEATER: "theater"
});

/** Animated border styles. */
export const BORDER_STYLES = Object.freeze(["none", "solid", "double", "gradient", "spin", "pulse", "rainbow", "flame"]);

/** Portrait shapes used in Token mode. */
export const BORDER_SHAPES = Object.freeze(["circle", "rounded", "square"]);

/** Entrance animations for cast members. */
export const ENTRANCES = Object.freeze(["fade", "slide", "rise", "zoom", "none"]);

/** Layout anchors. */
export const ANCHORS = Object.freeze(["bottom", "top", "left", "right", "center"]);

/** The silhouette used when a character has no image. */
export const SILHOUETTE = `modules/${MODULE_ID}/assets/silhouette.svg`;
