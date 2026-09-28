import { registerSettings } from "./settings.mjs";
import LibraryStore from "./data/library-store.mjs";
import ImmersiveStageLayer from "./canvas/stage-layer.mjs";
import ImmersiveOverlayLayer from "./canvas/overlay-layer.mjs";
import StageDirector from "./canvas/director.mjs";
import StageRenderer from "./canvas/stage-renderer.mjs";
import LiveController from "./live/live-controller.mjs";
import { createApi } from "./api.mjs";
import { registerSidebarTab } from "./apps/sidebar-tab.mjs";
import { registerQueries } from "./queries.mjs";
import { registerIntegrations } from "./integrations.mjs";
import { registerTokenHud } from "./token-hud.mjs";
import { registerKeybindings } from "./keybindings.mjs";
import CanvasEditing from "./canvas/canvas-editing.mjs";
import SlideshowDriver from "./live/slideshow-driver.mjs";
import { openDock } from "./apps/live-dock.mjs";
import { getSetting } from "./settings.mjs";
import { MODULE_ID, template } from "./constants.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Immersive Scenes`);
  registerSettings({
    onLibraryChange: key => {
      LibraryStore.invalidate(key);
      Hooks.callAll(`${MODULE_ID}.libraryChanged`, key);
    },
    onLiveChange: () => Hooks.callAll(`${MODULE_ID}.liveChanged`),
    onDisplayChange: key => Hooks.callAll(`${MODULE_ID}.displayChanged`, key)
  });

  // Canvas layers: world-space stage above the map, screen-space overlay for Cast-Only mode
  CONFIG.Canvas.layers.immersiveStage = { layerClass: ImmersiveStageLayer, group: "interface" };
  CONFIG.Canvas.layers.immersiveOverlay = { layerClass: ImmersiveOverlayLayer, group: "overlay" };

  registerSidebarTab();
  registerQueries();
  registerIntegrations();
  registerTokenHud();
  registerKeybindings();
  foundry.applications.handlebars.loadTemplates([
    template("sidebar/folder.hbs"),
    template("sidebar/card.hbs")
  ]);

  game.modules.get(MODULE_ID).api = createApi();
});

Hooks.once("ready", () => {
  StageDirector.init();
  LiveController.init();
  CanvasEditing.init();
  SlideshowDriver.init();
  if ( LiveController.canControl && getSetting("autoOpenDock") ) openDock();
});

export { LibraryStore, LiveController, StageDirector, StageRenderer };
