# Changelog

## 1.0.0
First release. Everything below is new.

- Project scaffold: manifest, tooling (eslint, static validation, node:test) and CI.
- Data layer: library settings (scenes, characters, folders, decks, live state), normalizers, LibraryStore, permission checks and pure layout, frame, resolve, diff and filename utilities with tests.
- Canvas renderer: world-space stage layer (above all placeable layers, below pings and rulers) and screen-space overlay layer, battlemap hiding without touching the Scene, backdrop with blurred surround and video support, hero sprites and bordered token portraits with nameplates, look crossfades, entrance and exit animations, canvas transitions, camera framing, and a GM-local preview (`api.preview(sceneId)`).
- Live broadcast: `LiveController` (broadcast, stop, mode, sequence steps, theater cuts, per-change transition override, `preBroadcast` hook). All clients follow the live state; late joiners and canvas redraws rebuild instantly; a deleted live scene stops the broadcast.
- Sidebar tab (before Settings) with scene, character and slideshow libraries: folders, tags, search, favorites, thumbnails with one-click broadcast and preview, context menus, drag and drop (actors become characters, images become scenes, cards move into folders). Players see their own characters with a look switcher.
- Scene editor (general, background sequence, cast, layout, camera shots, transitions) and character editor (actor link, owners, looks with folder import, border and nameplate). All edits save instantly and update a running broadcast live.
- Player requests via `CONFIG.queries` for look and border changes, validated by the GM.
- GM Live Dock (scene picker with transition override, display mode switch, background sequence steps, cast rows with look strips and quick actions, camera shot cuts, slideshow controls; detachable window). Also opened from a Token controls button.
- On-canvas editing for GMs: drag cast members, Shift+wheel to scale, right-click for a look palette; other clients see drag previews live.
- Animated portrait borders rendered by a custom shader: solid, double, gradient, spinning, pulse glow, rainbow and flame, in circle, rounded or square shapes. Frozen under reduced motion or photosensitive mode; static fallback if shaders are unavailable.
- Player border designer and a Token HUD look switcher for characters linked to the token's actor.
- Slideshows: decks of scenes (and background steps) with per-slide durations, looping and an optional transition override. The active GM drives the timer; another GM takes over if they leave. Play, pause, next, previous and stop from the dock, sidebar or API.
- Theater Mode: the theater layout (freeform with depth scaling), camera shots captured from your view, cuts that pull every client (players can pan away afterwards), a "Full stage" shot, next-shot cycling, and animated cinematic letterbox bars drawn in the canvas overlay.
- Keybindings (Live Dock, stop, background steps, next slide, next shot, canvas editing, next look), German translation, README and a release workflow.
