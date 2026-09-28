import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAspect, computeFrame, toWorld, toFrame, fitSize, shotToView, viewToShot } from "../scripts/utils/frame.mjs";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("parseAspect handles ratios, decimals and garbage", () => {
  near(parseAspect("16:9"), 16 / 9);
  near(parseAspect("21/9"), 21 / 9);
  near(parseAspect("1.5"), 1.5);
  near(parseAspect(2), 2);
  near(parseAspect("nope"), 16 / 9);
  near(parseAspect("0:9"), 16 / 9);
});

test("computeFrame letterboxes a wide rect and pillarboxes a tall one", () => {
  const wide = computeFrame({ x: 100, y: 100, width: 4000, height: 1000 }, 2);
  assert.deepEqual(wide, { x: 1100, y: 100, width: 2000, height: 1000 });
  const tall = computeFrame({ x: 0, y: 0, width: 1000, height: 4000 }, 2);
  assert.deepEqual(tall, { x: 0, y: 1750, width: 1000, height: 500 });
});

test("toWorld and toFrame are inverse", () => {
  const frame = { x: 50, y: 20, width: 1600, height: 900 };
  const w = toWorld(frame, 0.25, 0.75);
  const f = toFrame(frame, w.x, w.y);
  near(f.x, 0.25);
  near(f.y, 0.75);
});

test("fitSize cover/contain/stretch", () => {
  assert.deepEqual(fitSize(200, 100, 100, 100, "cover"), { width: 200, height: 100 });
  assert.deepEqual(fitSize(200, 100, 100, 100, "contain"), { width: 100, height: 50 });
  assert.deepEqual(fitSize(200, 100, 100, 100, "stretch"), { width: 100, height: 100 });
});

test("shotToView and viewToShot round-trip", () => {
  const frame = { x: 0, y: 0, width: 3200, height: 1800 };
  const screen = { width: 1920, height: 1080 };
  const full = shotToView(frame, { x: 0.5, y: 0.5, zoom: 1 }, screen);
  near(full.scale, 0.6);
  assert.deepEqual([full.x, full.y], [1600, 900]);
  const shot = { x: 0.3, y: 0.6, zoom: 0.4 };
  const back = viewToShot(frame, shotToView(frame, shot, screen), screen);
  near(back.x, shot.x);
  near(back.y, shot.y);
  near(back.zoom, shot.zoom);
});
