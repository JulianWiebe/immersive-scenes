import LibraryStore from "./data/library-store.mjs";
import StageDirector from "./canvas/director.mjs";
import StageRenderer from "./canvas/stage-renderer.mjs";
import LiveController from "./live/live-controller.mjs";

/**
 * The public API, available as `game.modules.get("immersive-scenes").api`.
 */
export function createApi() {
  return {
    LibraryStore,
    StageDirector,
    StageRenderer,
    LiveController,

    /** Broadcast a library scene to everyone (GM). */
    broadcast: (sceneId, options) => LiveController.broadcast(sceneId, options),

    /** End the broadcast (GM). */
    stop: options => LiveController.stop(options),

    /** Cut all cameras to a theater shot of the live scene (GM). */
    cutTo: shotId => LiveController.cutTo(shotId),

    /** Advance the live scene's background sequence (GM). */
    nextStep: () => LiveController.nextStep(),
    prevStep: () => LiveController.prevStep(),

    /** Show a library scene on this client only. */
    preview: (sceneId, options) => StageDirector.startPreview(sceneId, options),

    /** End the local preview. */
    stopPreview: () => StageDirector.stopPreview()
  };
}
