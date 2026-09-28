/**
 * Keyboard shortcuts. Only the dock toggle has a default binding; the rest can be assigned in
 * Configure Controls.
 */
import { MODULE_ID } from "./constants.mjs";
import LibraryStore from "./data/library-store.mjs";
import LiveController from "./live/live-controller.mjs";
import StageDirector from "./canvas/director.mjs";
import CanvasEditing from "./canvas/canvas-editing.mjs";
import { toggleDock } from "./apps/live-dock.mjs";
import { toggleLibrary } from "./apps/library.mjs";
import { isCharacterOwner } from "./data/permissions.mjs";
import { resolveLook } from "./utils/resolve.mjs";
import { requestCharacterAction } from "./queries.mjs";

export function registerKeybindings() {
  const register = (action, data) => game.keybindings.register(MODULE_ID, action, {
    name: `IMMERSIVE_SCENES.Keybindings.${action}.Name`,
    hint: `IMMERSIVE_SCENES.Keybindings.${action}.Hint`,
    editable: [],
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    ...data
  });
  const gm = fn => () => {
    if ( !LiveController.canControl ) return false;
    fn();
    return true;
  };

  register("toggleDock", { editable: [{ key: "KeyL", modifiers: ["Shift"] }], restricted: true, onDown: gm(() => toggleDock()) });
  register("toggleLibrary", { restricted: true, onDown: gm(() => toggleLibrary()) });
  register("stopBroadcast", { restricted: true, onDown: gm(() => LiveController.stop()) });
  register("nextStep", { restricted: true, onDown: gm(() => LiveController.nextStep()) });
  register("prevStep", { restricted: true, onDown: gm(() => LiveController.prevStep()) });
  register("nextSlide", { restricted: true, onDown: gm(() => LiveController.stepDeck(1)) });
  register("toggleCanvasEditing", { restricted: true, onDown: gm(() => CanvasEditing.toggle()) });
  register("nextShot", {
    restricted: true,
    onDown: gm(() => {
      const live = StageDirector.live;
      const shots = LibraryStore.getScene(live.sceneId)?.shots ?? [];
      if ( !live.active || !shots.length ) return;
      const index = (shots.findIndex(s => s.id === live.shot?.id) + 1) % shots.length;
      LiveController.cutTo(shots[index].id);
    })
  });
  register("cycleLook", {
    onDown: () => {
      cycleOwnLook();
      return true;
    }
  });
}

/**
 * Switch to the next look of your character: the one on stage, else the one linked to your
 * assigned actor, else your first character.
 */
async function cycleOwnLook() {
  const live = StageDirector.live;
  const onStage = new Set(live.active ? LibraryStore.getScene(live.sceneId)?.cast.map(e => e.characterId) : []);
  const mine = LibraryStore.list("characters").filter(c => c.looks.length > 1 && isCharacterOwner(game.user, c)
    && (!game.user.isGM || onStage.has(c.id)));
  const assigned = game.user.character?.uuid;
  const character = mine.find(c => onStage.has(c.id)) ?? mine.find(c => c.actorUuid === assigned) ?? mine[0];
  if ( !character ) return;
  const current = resolveLook(character);
  const index = (character.looks.findIndex(l => l.id === current?.id) + 1) % character.looks.length;
  await requestCharacterAction(character.id, "setLook", { lookId: character.looks[index].id });
}
