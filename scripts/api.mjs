import LibraryStore from "./data/library-store.mjs";
import StageDirector from "./canvas/director.mjs";
import StageRenderer from "./canvas/stage-renderer.mjs";
import LiveController from "./live/live-controller.mjs";
import SceneEditor from "./apps/scene-editor.mjs";
import CharacterEditor from "./apps/character-editor.mjs";
import { requestCharacterAction } from "./queries.mjs";

/** Render an application singleton by id, creating it if needed. */
function renderApp(id, create) {
  const existing = foundry.applications.instances.get(id);
  if ( existing ) {
    existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  const app = create();
  app.render({ force: true });
  return app;
}

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
    stopPreview: () => StageDirector.stopPreview(),

    /** Open the editor of a library scene. */
    editScene: sceneId => renderApp(`immersive-scene-editor-${sceneId}`, () => new SceneEditor({ sceneId })),

    /** Open the editor of a library character. */
    editCharacter: characterId => renderApp(`immersive-character-editor-${characterId}`, () => new CharacterEditor({ characterId })),

    /** Change a character's look (players: requires ownership and a GM online). */
    setLook: (characterId, lookId) => requestCharacterAction(characterId, "setLook", { lookId }),

    /** Change a character's border (players: requires ownership and a GM online). */
    setBorder: (characterId, border) => requestCharacterAction(characterId, "setBorder", { border })
  };
}
