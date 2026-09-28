import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import LibraryStore from "./data/library-store.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Immersive Scenes`);
  registerSettings({
    onLibraryChange: key => {
      LibraryStore.invalidate(key);
      Hooks.callAll(`${MODULE_ID}.libraryChanged`, key);
    },
    onLiveChange: () => Hooks.callAll(`${MODULE_ID}.liveChanged`),
    onDisplayChange: () => Hooks.callAll(`${MODULE_ID}.displayChanged`)
  });
  game.modules.get(MODULE_ID).api = { LibraryStore };
});
