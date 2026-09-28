import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("module.json is valid JSON with the expected id", () => {
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.equal(manifest.id, "immersive-scenes");
  assert.equal(manifest.compatibility.minimum, "14");
});
