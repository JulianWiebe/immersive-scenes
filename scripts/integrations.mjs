/**
 * Hooks into core UI: scene control buttons and the Actors directory context menu.
 */
import { SIDEBAR_TAB } from "./constants.mjs";
import LibraryStore from "./data/library-store.mjs";
import LiveController from "./live/live-controller.mjs";
import { toggleDock } from "./apps/live-dock.mjs";

export function registerIntegrations() {
  Hooks.on("getSceneControlButtons", controls => {
    const tools = controls.tokens?.tools;
    if ( !tools ) return;
    const order = Object.keys(tools).length + 1;
    if ( LiveController.canControl ) {
      tools.immersiveDock = {
        name: "immersiveDock",
        order,
        title: "IMMERSIVE_SCENES.Dock.Title",
        icon: "fa-solid fa-masks-theater",
        button: true,
        onChange: () => toggleDock()
      };
    }
    else {
      tools.immersiveLooks = {
        name: "immersiveLooks",
        order,
        title: "IMMERSIVE_SCENES.Player.MyCharacters",
        icon: "fa-solid fa-masks-theater",
        button: true,
        onChange: () => ui[SIDEBAR_TAB]?.activate()
      };
    }
  });

  Hooks.on("getActorContextOptions", (app, entries) => {
    entries.push({
      label: "IMMERSIVE_SCENES.Integrations.MakeCharacter",
      icon: "fa-solid fa-masks-theater",
      visible: () => LiveController.canControl,
      onClick: async (event, li) => {
        const actor = game.actors.get(li.dataset.entryId);
        if ( !actor ) return;
        const character = await LibraryStore.createCharacterFromActor(actor);
        game.modules.get("immersive-scenes").api.editCharacter(character.id);
      }
    });
  });
}
