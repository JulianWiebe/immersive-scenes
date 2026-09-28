/**
 * Player → GM requests. Players cannot write world settings, so look and border changes of their
 * own characters are sent as a query to the active GM, who checks permissions and applies them.
 */
import { MODULE_ID } from "./constants.mjs";
import LibraryStore from "./data/library-store.mjs";
import { canPerform, canWriteLibrary, isCharacterOwner } from "./data/permissions.mjs";
import { normalizeBorder } from "./utils/schema.mjs";

export const CHARACTER_ACTION = `${MODULE_ID}.characterAction`;
const TIMEOUT = 8000;

/** Register query handlers. Called during `init`. */
export function registerQueries() {
  CONFIG.queries[CHARACTER_ACTION] = async (data, { user }) => applyCharacterAction(user, data);
}

/**
 * Apply a character action on behalf of a user (runs on the GM).
 * @param {User} user
 * @param {{characterId: string, action: string, payload: object}} data
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function applyCharacterAction(user, { characterId, action, payload = {} } = {}) {
  const character = LibraryStore.getCharacter(characterId);
  if ( !character ) return { ok: false, error: "IMMERSIVE_SCENES.Errors.UnknownCharacter" };
  if ( !isCharacterOwner(user, character) ) return { ok: false, error: "IMMERSIVE_SCENES.Errors.NotAllowed" };
  if ( !canPerform(user, character, action) ) return { ok: false, error: "IMMERSIVE_SCENES.Errors.Disabled" };
  switch ( action ) {
    case "setLook": {
      if ( !character.looks.some(l => l.id === payload.lookId) ) return { ok: false, error: "IMMERSIVE_SCENES.Errors.UnknownLook" };
      await LibraryStore.update("characters", characterId, { currentLookId: payload.lookId });
      Hooks.callAll(`${MODULE_ID}.lookChanged`, characterId, payload.lookId, user);
      return { ok: true };
    }
    case "setBorder": {
      const border = normalizeBorder({ ...character.border, ...payload.border });
      await LibraryStore.update("characters", characterId, { border });
      return { ok: true };
    }
    default:
      return { ok: false, error: "IMMERSIVE_SCENES.Errors.NotAllowed" };
  }
}

/**
 * Request a character action. GMs apply it directly; players ask the active GM.
 * Errors are shown as notifications.
 * @param {string} characterId
 * @param {"setLook"|"setBorder"} action
 * @param {object} payload
 * @returns {Promise<boolean>} Whether the change was applied
 */
export async function requestCharacterAction(characterId, action, payload) {
  let result;
  try {
    if ( canWriteLibrary() ) result = await applyCharacterAction(game.user, { characterId, action, payload });
    else {
      const gm = game.users.activeGM;
      if ( !gm ) {
        ui.notifications.warn("IMMERSIVE_SCENES.Errors.NoGM", { localize: true });
        return false;
      }
      result = await gm.query(CHARACTER_ACTION, { characterId, action, payload }, { timeout: TIMEOUT });
    }
  }
  catch(err) {
    console.error(`${MODULE_ID} | Character action failed`, err);
    result = { ok: false, error: "IMMERSIVE_SCENES.Errors.RequestFailed" };
  }
  if ( !result?.ok ) ui.notifications.warn(result?.error ?? "IMMERSIVE_SCENES.Errors.RequestFailed", { localize: true });
  return !!result?.ok;
}
