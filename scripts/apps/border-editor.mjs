/**
 * A compact border designer for players (and GMs) to style a character's portrait border.
 * Changes go through the GM query, so they are validated and applied for everyone.
 */
import { MODULE_ID, template } from "../constants.mjs";
import LibraryStore from "../data/library-store.mjs";
import { requestCharacterAction } from "../queries.mjs";
import { resolveLook, lookImage } from "../utils/resolve.mjs";
import { BORDER_STYLES } from "./character-editor.mjs";
import { t, indexedToArray } from "./helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class BorderEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ characterId, ...options } = {}) {
    super({ id: `immersive-border-editor-${characterId}`, ...options });
    this.characterId = characterId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["immersive-scenes", "border-editor"],
    tag: "form",
    window: { icon: "fa-solid fa-palette" },
    position: { width: 460 },
    form: { handler: BorderEditor.#onSubmit, submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    form: { template: template("apps/border-editor.hbs") }
  };

  characterId;

  #hookId = null;

  get title() {
    return `${t("Player.EditBorder")}: ${LibraryStore.getCharacter(this.characterId)?.name ?? ""}`;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const character = LibraryStore.getCharacter(this.characterId);
    if ( !character ) return context;
    const look = resolveLook(character);
    Object.assign(context, {
      character,
      borderStyles: Object.fromEntries(BORDER_STYLES.map(s => [s, t(`Border.${s}`)])),
      borderShapes: Object.fromEntries(["circle", "rounded", "square"].map(s => [s, t(`Shape.${s}`)])),
      borderPreview: look ? lookImage(look, "token") : ""
    });
    return context;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#hookId = Hooks.on(`${MODULE_ID}.libraryChanged`, key => {
      if ( key === "characters" ) this.render();
    });
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off(`${MODULE_ID}.libraryChanged`, this.#hookId);
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if ( !data.border ) return;
    const border = { ...data.border };
    if ( border.colors ) border.colors = indexedToArray(border.colors);
    await requestCharacterAction(this.characterId, "setBorder", { border });
  }
}

/** Open the border editor for a character. */
export function openBorderEditor(characterId) {
  const id = `immersive-border-editor-${characterId}`;
  const existing = foundry.applications.instances.get(id);
  if ( existing ) return existing.render({ force: true });
  return new BorderEditor({ characterId }).render({ force: true });
}
