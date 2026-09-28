import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCharacter, normalizeScene, normalizeLive, normalizeDeck, normalizeCollection, normalizeFolder
} from "../scripts/utils/schema.mjs";

test("normalizeCharacter fills defaults and drops dangling look pointers", () => {
  const c = normalizeCharacter({ name: "  Aria ", looks: [{ id: "a", name: "Casual" }], currentLookId: "zzz", defaultLookId: "a" });
  assert.equal(c.name, "Aria");
  assert.equal(c.currentLookId, null);
  assert.equal(c.defaultLookId, "a");
  assert.equal(c.border.style, "solid");
  assert.equal(c.border.colors.length, 3);
  assert.equal(c.nameplate.show, true);
  assert.match(c.id, /^[A-Za-z0-9]{16}$/);
});

test("duplicate look ids are regenerated", () => {
  const c = normalizeCharacter({ looks: [{ id: "a" }, { id: "a" }] });
  assert.notEqual(c.looks[0].id, c.looks[1].id);
});

test("normalizeScene validates enums and clamps numbers", () => {
  const s = normalizeScene({
    mode: "weird", layout: { type: "grid", spacing: 99, rows: 3.6 },
    cast: [{ characterId: "c1", x: 9 }, { characterId: "" }],
    backgrounds: [{ src: "a.webp", fit: "nope" }]
  });
  assert.equal(s.mode, "hero");
  assert.equal(s.layout.type, "grid");
  assert.equal(s.layout.spacing, 1);
  assert.equal(s.layout.rows, 4);
  assert.equal(s.cast.length, 1);
  assert.equal(s.cast[0].x, 1.5);
  assert.equal(s.backgrounds[0].fit, "cover");
  assert.equal(s.transition.type, "fade");
});

test("normalizeLive is inactive without a scene", () => {
  assert.equal(normalizeLive({ active: true }).active, false);
  const live = normalizeLive({ active: true, sceneId: "s1", step: 2.2, shot: { id: "x", nonce: 3 }, mode: "cast" });
  assert.equal(live.active, true);
  assert.equal(live.step, 2);
  assert.deepEqual(live.shot, { id: "x", nonce: 3 });
  assert.equal(live.mode, "cast");
});

test("normalizeDeck drops items without a scene", () => {
  const d = normalizeDeck({ items: [{ sceneId: "a", duration: 0 }, { sceneId: "" }] });
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].duration, 1);
  assert.equal(d.transition, null);
});

test("normalizeCollection keys records by id and accepts arrays", () => {
  const col = normalizeCollection([{ id: "a", name: "x" }, { id: "a", name: "y" }, null], normalizeFolder);
  assert.equal(Object.keys(col).length, 2);
  assert.equal(col.a.name, "x");
});
