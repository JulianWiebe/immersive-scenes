import LibraryStore from "./data/library-store.mjs";
import StageDirector from "./canvas/director.mjs";
import StageRenderer from "./canvas/stage-renderer.mjs";

/**
 * The public API, available as `game.modules.get("immersive-scenes").api`.
 */
export function createApi() {
  return {
    LibraryStore,
    StageDirector,
    StageRenderer,

    /** Show a library scene on this client only. */
    preview: (sceneId, options) => StageDirector.startPreview(sceneId, options),

    /** End the local preview. */
    stopPreview: () => StageDirector.stopPreview()
  };
}
