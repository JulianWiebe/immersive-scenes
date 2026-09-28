import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLook, lookImage, buildView } from "../scripts/utils/resolve.mjs";
import { diffViews } from "../scripts/utils/diff.mjs";
import { normalizeCharacter, normalizeScene } from "../scripts/utils/schema.mjs";

const aria = normalizeCharacter({
  id: "aria", name: "Aria",
  looks: [
    { id: "casual", name: "Casual", portrait: "casual-p.webp", sprite: "casual.webp" },
    { id: "armor", name: "Armor", sprite: "armor.webp" },
    { id: "gala", name: "Gala", portrait: "gala-p.webp" }
  ],
  defaultLookId: "casual"
});

test("resolveLook order: pin → current → default → first", () => {
  assert.equal(resolveLook(aria, "armor").id, "armor");
  assert.equal(resolveLook(aria).id, "casual");
  assert.equal(resolveLook({ ...aria, currentLookId: "gala" }).id, "gala");
  assert.equal(resolveLook({ ...aria, defaultLookId: null }).id, "casual");
  assert.equal(resolveLook({ ...aria, looks: [] }), null);
});

test("lookImage prefers the mode's image and falls back", () => {
  const [casual, armor, gala] = aria.looks;
  assert.equal(lookImage(casual, "token"), "casual-p.webp");
  assert.equal(lookImage(casual, "hero"), "casual.webp");
  assert.equal(lookImage(armor, "token"), "armor.webp");
  assert.equal(lookImage(gala, "hero"), "gala-p.webp");
  assert.equal(lookImage(null, "hero", "actor.webp"), "actor.webp");
});

const scene = normalizeScene({
  id: "s1", mode: "hero",
  backgrounds: [{ id: "b1", src: "a.webp" }, { id: "b2", src: "b.webp" }],
  cast: [{ id: "e1", characterId: "aria" }, { id: "e2", characterId: "ghost" }]
});

test("buildView skips unknown characters and clamps the step", () => {
  const view = buildView({ scene, characters: { aria }, step: 5 });
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].src, "casual.webp");
  assert.equal(view.items[0].name, "Aria");
  assert.equal(view.step, 1);
  assert.equal(view.background.src, "b.webp");
  assert.equal(buildView({ scene, characters: { aria }, mode: "token" }).items[0].src, "casual-p.webp");
});

test("diffViews detects start, stop, scene switch and look swaps", () => {
  const a = buildView({ scene, characters: { aria } });
  assert.equal(diffViews(null, a).kind, "start");
  assert.equal(diffViews(a, null).kind, "stop");
  assert.equal(diffViews(a, { ...a, sceneId: "other" }).kind, "scene");
  assert.equal(diffViews(a, buildView({ scene, characters: { aria } })).kind, "none");

  const swapped = buildView({ scene, characters: { aria: { ...aria, currentLookId: "armor" } } });
  const d = diffViews(a, swapped);
  assert.equal(d.kind, "update");
  assert.equal(d.looks.length, 1);
  assert.equal(d.moved.length, 0);

  const stepped = buildView({ scene, characters: { aria }, step: 1 });
  assert.equal(diffViews(a, stepped).backgroundChanged, true);
});

test("cast mode uses the scene's cast style", () => {
  const castScene = { ...scene, mode: "cast", castStyle: "token" };
  const view = buildView({ scene: castScene, characters: { aria } });
  assert.equal(view.mode, "cast");
  assert.equal(view.style, "token");
  assert.equal(view.items[0].src, "casual-p.webp");
  const hero = buildView({ scene: { ...castScene, castStyle: "hero" }, characters: { aria } });
  assert.equal(diffViews(view, hero).modeChanged, true);
});
