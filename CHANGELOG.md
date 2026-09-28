# Changelog

## Unreleased
- Project scaffold: manifest, tooling (eslint, static validation, node:test) and CI.
- Data layer: library settings (scenes, characters, folders, decks, live state), normalizers, LibraryStore, permission checks and pure layout, frame, resolve, diff and filename utilities with tests.
- Canvas renderer: world-space stage layer (above all placeable layers, below pings and rulers) and screen-space overlay layer, battlemap hiding without touching the Scene, backdrop with blurred surround and video support, hero sprites and bordered token portraits with nameplates, look crossfades, entrance and exit animations, canvas transitions, camera framing, and a GM-local preview (`api.preview(sceneId)`).
