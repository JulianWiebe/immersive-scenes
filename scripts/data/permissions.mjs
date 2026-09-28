import { getSetting } from "../settings.mjs";

/**
 * Whether a user may change a character's look or border.
 * GMs always may; players need to be listed as owner or own the linked actor.
 * @param {User} user
 * @param {object} character   Normalized character
 * @returns {boolean}
 */
export function isCharacterOwner(user, character) {
  if ( !user || !character ) return false;
  if ( user.isGM ) return true;
  if ( character.ownerIds.includes(user.id) ) return true;
  if ( !character.actorUuid ) return false;
  const actor = fromUuidSync(character.actorUuid, { strict: false });
  return !!actor?.testUserPermission?.(user, "OWNER");
}

/**
 * Whether a user may perform a given character action right now.
 * @param {User} user
 * @param {object} character
 * @param {"setLook"|"setBorder"} action
 * @returns {boolean}
 */
export function canPerform(user, character, action) {
  if ( !isCharacterOwner(user, character) ) return false;
  if ( user.isGM ) return true;
  if ( action === "setLook" ) return !!getSetting("allowPlayerLooks");
  if ( action === "setBorder" ) return !!getSetting("allowPlayerBorders");
  return false;
}

/** Whether the current user may write library settings directly. */
export function canWriteLibrary(user = game.user) {
  return !!user?.can("SETTINGS_MODIFY");
}
