import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, spread, materialize } from "../scripts/utils/layout.mjs";
import { normalizeLayout, normalizeCastEntry } from "../scripts/utils/schema.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const cast = n => Array.from({ length: n }, (_, i) => normalizeCastEntry({ id: `e${i}`, characterId: `c${i}` }));

test("spread centres members and respects margins", () => {
  assert.deepEqual(spread(1, 0.2, 0.05), [0.5]);
  const three = spread(3, 0.2, 0.05);
  near(three[0], 0.3);
  near(three[1], 0.5);
  near(three[2], 0.7);
  const many = spread(11, 0.2, 0.05);
  near(many[0], 0.05);
  near(many[10], 0.95);
});

test("row layout for heroes puts feet near the bottom", () => {
  const layout = normalizeLayout({ type: "row" });
  const placements = computeLayout(layout, cast(3), { mode: "hero" });
  assert.equal(placements.size, 3);
  for ( const p of placements.values() ) {
    assert.ok(p.y > 0.95 && p.y <= 1);
    near(p.size, layout.heroSize);
  }
  const xs = [...placements.values()].map(p => p.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});

test("hidden entries are skipped", () => {
  const entries = cast(3);
  entries[1].hidden = true;
  const placements = computeLayout(normalizeLayout({}), entries, { mode: "token" });
  assert.deepEqual([...placements.keys()], ["e0", "e2"]);
});

test("grid layout fits tokens into cells and centres the last row", () => {
  const layout = normalizeLayout({ type: "grid", columns: 2, tokenSize: 0.8 });
  const placements = computeLayout(layout, cast(3), { mode: "token" });
  const [a, b, c] = ["e0", "e1", "e2"].map(id => placements.get(id));
  assert.ok(a.size < 0.8, "shrunk to fit");
  near(a.y, b.y);
  assert.ok(c.y > a.y);
  near(c.x, 0.5);
});

test("free layout uses entry coordinates and the entry scale", () => {
  const entries = [normalizeCastEntry({ id: "a", characterId: "x", x: 0.2, y: 0.7, scale: 2 })];
  const p = computeLayout(normalizeLayout({ type: "free", tokenSize: 0.3 }), entries, { mode: "token" }).get("a");
  assert.deepEqual([p.x, p.y], [0.2, 0.7]);
  near(p.size, 0.6);
});

test("theater layout scales and orders by depth", () => {
  const entries = [
    normalizeCastEntry({ id: "back", characterId: "x", x: 0.3, y: 0.5 }),
    normalizeCastEntry({ id: "front", characterId: "y", x: 0.6, y: 1 })
  ];
  const layout = normalizeLayout({ type: "theater", depth: 0.5 });
  const placements = computeLayout(layout, entries, { mode: "hero" });
  const back = placements.get("back");
  const front = placements.get("front");
  assert.ok(back.size < front.size);
  assert.ok(back.z < front.z);
  near(back.size, layout.heroSize * 0.75);
});

test("explicit z wins over list order", () => {
  const entries = cast(2);
  entries[0].z = 10;
  const placements = computeLayout(normalizeLayout({}), entries, { mode: "hero" });
  assert.ok(placements.get("e0").z > placements.get("e1").z);
});

test("materialize freezes computed slots into coordinates", () => {
  const entries = cast(2);
  const placements = computeLayout(normalizeLayout({ type: "row" }), entries, { mode: "hero" });
  const frozen = materialize(entries, placements);
  near(frozen[0].x, placements.get("e0").x, 1e-4);
  near(frozen[1].y, placements.get("e1").y, 1e-4);
});
