import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import LibraryStore from "./data/library-store.mjs";
import ImmersiveStageLayer from "./canvas/stage-layer.mjs";
import ImmersiveOverlayLayer from "./canvas/overlay-layer.mjs";
import StageDirector from "./canvas/director.mjs";
import StageRenderer from "./canvas/stage-renderer.mjs";
import LiveController from "./live/live-controller.mjs";
import { createApi } from "./api.mjs";

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

  // Canvas layers: world-space stage above the map, screen-space overlay for Cast-Only mode
  CONFIG.Canvas.layers.immersiveStage = { layerClass: ImmersiveStageLayer, group: "interface" };
  CONFIG.Canvas.layers.immersiveOverlay = { layerClass: ImmersiveOverlayLayer, group: "overlay" };

  game.modules.get(MODULE_ID).api = createApi();
});

Hooks.once("ready", () => {
  StageDirector.init();
  LiveController.init();
});

export { LibraryStore, LiveController, StageDirector, StageRenderer };
