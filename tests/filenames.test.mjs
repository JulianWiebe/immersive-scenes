import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLookFilename, groupLookFiles, humanize } from "../scripts/utils/filenames.mjs";

test("humanize", () => {
  assert.equal(humanize("battle-armor"), "Battle Armor");
  assert.equal(humanize("nightGown"), "Night Gown");
});

test("parseLookFilename patterns", () => {
  assert.deepEqual(parseLookFilename("chars/Aria.webp"), { character: "Aria", look: "Default", kind: null, src: "chars/Aria.webp" });
  assert.equal(parseLookFilename("Aria_battle-armor.webp").look, "Battle Armor");
  assert.equal(parseLookFilename("Aria - Battle Armor.png").look, "Battle Armor");
  assert.equal(parseLookFilename("Aria_battle-armor_portrait.png").kind, "portrait");
  assert.equal(parseLookFilename("Aria_battle-armor_full.webm").kind, "sprite");
  assert.equal(parseLookFilename("Aria%20Moon_gala.webp").character, "Aria Moon");
});

test("groupLookFiles pairs portraits and sprites per look", () => {
  const groups = groupLookFiles([
    "a/Aria_armor.webp", "a/Aria_armor_portrait.webp", "a/Aria_gala_full.webp", "a/Bran.webp"
  ]);
  assert.deepEqual([...groups.keys()], ["Aria", "Bran"]);
  const armor = groups.get("Aria").get("Armor");
  assert.equal(armor.portrait, "a/Aria_armor_portrait.webp");
  assert.equal(armor.sprite, "a/Aria_armor.webp");
  assert.equal(groups.get("Aria").get("Gala").sprite, "a/Aria_gala_full.webp");
  assert.equal(groups.get("Bran").get("Default").sprite, "a/Bran.webp");
});
