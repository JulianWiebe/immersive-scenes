import { test } from "node:test";
import assert from "node:assert/strict";
import { applyActorSync } from "../scripts/utils/actor-sync.mjs";
import { normalizeCharacter, normalizeLook } from "../scripts/utils/schema.mjs";

const createLook = () => normalizeLook({ id: "new", name: "Default" });
const source = { name: "Aria", img: "art/aria.webp", token: "tokens/aria.webp" };

function imported() {
  return applyActorSync(normalizeCharacter({ id: "c", actorUuid: "Actor.x", actorSync: { enabled: true } }), source,
    { force: true, createLook });
}

test("a forced sync creates the actor look and copies name and images", () => {
  const c = imported();
  assert.equal(c.name, "Aria");
  assert.equal(c.looks.length, 1);
  assert.deepEqual([c.looks[0].sprite, c.looks[0].portrait, c.looks[0].fromActor], ["art/aria.webp", "tokens/aria.webp", true]);
  assert.equal(c.defaultLookId, "new");
  assert.deepEqual(c.actorSync, { enabled: true, name: "Aria", img: "art/aria.webp", token: "tokens/aria.webp" });
});

test("syncing unchanged values is a no-op", () => {
  assert.equal(applyActorSync(imported(), source), null);
});

test("only changed actor values overwrite the character", () => {
  const c = imported();
  c.name = "Aria (disguised)";
  c.looks[0].sprite = "custom/sprite.webp";
  const next = applyActorSync(c, { ...source, token: "tokens/aria-2.webp" });
  assert.equal(next.name, "Aria (disguised)", "manual rename survives");
  assert.equal(next.looks[0].sprite, "custom/sprite.webp", "manual sprite survives");
  assert.equal(next.looks[0].portrait, "tokens/aria-2.webp");
  const renamed = applyActorSync(next, { ...source, name: "Aria the Bold", token: "tokens/aria-2.webp" });
  assert.equal(renamed.name, "Aria the Bold");
});

test("a placed token change updates the portrait without moving the remembered prototype", () => {
  const next = applyActorSync(imported(), source, { placedToken: "tokens/aria-wounded.webp" });
  assert.equal(next.looks[0].portrait, "tokens/aria-wounded.webp");
  assert.equal(next.actorSync.token, "tokens/aria.webp");
  assert.equal(applyActorSync(next, source), null, "a later sync does not revert it");
});

test("an existing look showing the actor images is adopted instead of duplicated", () => {
  const c = normalizeCharacter({
    actorUuid: "Actor.x", actorSync: { enabled: true },
    looks: [{ id: "old", sprite: "art/aria.webp", portrait: "tokens/aria.webp" }, { id: "armor", sprite: "a.webp" }]
  });
  const next = applyActorSync(c, source, { force: true, createLook });
  assert.equal(next.looks.length, 2);
  assert.equal(next.looks[0].fromActor, true);
  assert.equal(next.looks[1].fromActor, false);
});

test("without a token image the portrait falls back to the artwork", () => {
  const c = applyActorSync(normalizeCharacter({ actorUuid: "Actor.x" }), { name: "Bran", img: "art/bran.webp", token: "" },
    { force: true, createLook });
  assert.equal(c.looks[0].portrait, "art/bran.webp");
});

test("actorSource ignores placeholder artwork", async () => {
  const { actorSource } = await import("../scripts/utils/actor-sync.mjs");
  assert.deepEqual(actorSource({ name: "X", img: "icons/svg/mystery-man.svg", prototypeToken: { texture: { src: "t.webp" } } }),
    { name: "X", img: "", token: "t.webp" });
});
