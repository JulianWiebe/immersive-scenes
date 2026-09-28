# Immersive Scenes

A FoundryVTT **v14** module for cinematic, visual-novel style scenes that are drawn **inside the Foundry canvas**.

There is no extra Foundry scene and no screen-covering overlay. The battlemap you are viewing stays the stage, and an immersive scene takes it over temporarily:
- Everyone can still pan and zoom.
- Pings, cursors and rulers keep working.
- When the scene ends, the map returns exactly as it was.
- The Scene document is never modified.

> **Early preview (0.x).** The feature set is complete and has been tested in Foundry 14.368, but expect rough edges.

## Features

### Scenes and cinematic display
- **Scene library.** It lives in its own sidebar tab and supports folders, tags, search and favorites. Drag an image onto the tab to create a scene.
- **Backgrounds.** Images or videos, fitted into a stage frame with a fixed aspect ratio that is centred on the current map. A blurred copy fills the rest of the canvas.
- **Three display modes:**
  - **Hero:** full-body transparent sprites, visual-novel style.
  - **Token:** round, rounded or square portraits with animated borders.
  - **Cast-Only:** no backdrop. The cast is drawn in screen space over the battlemap, which stays visible and fully usable.
- **Cast layouts:**
  - row, column or grid
  - freeform (drag anyone anywhere)
  - theater (freeform with depth scaling)
- **Transitions** between scenes, modes and backgrounds use Foundry v14's canvas transition shaders: fade, swirl, water drop, morph, glitch, dots and more. Cast members get their own entrance animations (fade, slide, rise, zoom).
- **Live editing.** Every edit saves instantly, so changing the live scene updates everyone's screen in real time.

### Living characters
- **Character library.** Characters can optionally be linked to an Actor. The actor's owners, and any players you list, may change the character's look and border.
- **Looks** (outfits, armor, transformations). Each look has a full-body sprite and a portrait, with scale, offset and mirroring. Import a whole folder at once: files named `Aria_battle-armor.webp`, `Aria_battle-armor_portrait.webp` and so on are grouped automatically.
- **Animated borders** rendered by a shader:
  - Styles: solid, double, gradient, spinning, pulse glow, rainbow or flame.
  - Colors are your choice.
  - Animation freezes under reduced motion or photosensitive mode.
- **Players swap looks in real time.** They can do it from the sidebar tab, the Token HUD, or a keybinding. The request is validated by the GM's client, so a GM must be online.

### Live show control
- **Live Dock** (GM). From one window you can:
  - switch scenes, with an optional transition override;
  - change the display mode;
  - step through background sequences;
  - edit the cast and their looks;
  - cut between camera shots;
  - control slideshows.
  The dock can be detached into its own browser window.
- **Edit on canvas:**
  - Drag cast members to move them.
  - Shift+mouse wheel scales a cast member.
  - Right-click opens a look palette with quick actions.
  - Players see drag previews live.
- **Sequences.** Give a scene several backgrounds and advance them manually.
- **Slideshows.** Build decks of scenes, each with its own duration. They advance automatically and can loop. If the driving GM leaves, another GM takes over.
- **Theater Mode:**
  - Save camera shots from your current view.
  - Cut everyone's camera to a shot; players may pan away afterwards.
  - Add cinematic letterbox bars.
- **Preview on my canvas.** Compose a scene privately before broadcasting it.

## Usage
1. Open the **Immersive Scenes** sidebar tab (the masks icon).
2. Under **Characters**, create characters, or drop Actors onto the tab. Add looks in the character editor.
3. Under **Scenes**, create a scene, add backgrounds and cast, then press **Broadcast**. Or use **Preview on my canvas** first.
4. Open the **Live Dock** (Shift+L, or the masks button in the Token controls) to run the scene.

Players see a **My characters** section in the sidebar tab for their own characters.

> An immersive scene is drawn on the canvas of whatever map each client is viewing. A client that views no scene at all has no canvas, so it cannot show the immersive scene.

## API
`game.modules.get("immersive-scenes").api` exposes the following:
- **Broadcasting:** `broadcast(sceneId, {step, mode, transition})`, `stop()`, `cutTo(shotId)`, `nextStep()`, `prevStep()`.
- **Preview:** `preview(sceneId)` and `stopPreview()`.
- **Slideshows:** `playDeck(deckId)`, `pauseDeck()`, `resumeDeck()`, `nextSlide()`, `prevSlide()`, `stopDeck()`.
- **Characters:** `setLook(characterId, lookId)` and `setBorder(characterId, border)`.
- **Windows:** `openDock()`, `toggleDock()`, `editScene(id)`, `editCharacter(id)`, `editDeck(id)`, `openBorderEditor(id)`.
- **Classes:** `LibraryStore`, `LiveController`, `StageDirector` and `StageRenderer`, for scripting.

Hooks:
- `immersive-scenes.preBroadcast` can be cancelled.
- `immersive-scenes.liveStateChanged`, `immersive-scenes.libraryChanged`, `immersive-scenes.lookChanged` and `immersive-scenes.spriteCreated` are notifications.

## Development
There is no build step: the module is plain ES modules.

```bash
npm install
npm run check   # eslint + static validation (manifest, templates, i18n keys) + unit tests
```

Pure logic lives in `scripts/utils/` and is unit-tested with `node:test`: layout, frame and camera math, look resolution, view diffing, schema normalization, the folder tree and filename parsing.

## License
MIT
