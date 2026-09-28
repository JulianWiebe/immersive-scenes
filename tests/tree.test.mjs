import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, matchesFilter, collectTags } from "../scripts/utils/tree.mjs";

const folders = [
  { id: "a", name: "Act I", parent: null, sort: 0 },
  { id: "b", name: "Town", parent: "a", sort: 0 },
  { id: "c", name: "Loop", parent: "d", sort: 0 },
  { id: "d", name: "Loop2", parent: "c", sort: 0 },
  { id: "e", name: "Orphan", parent: "zzz", sort: 0 }
];
const records = [
  { id: "1", name: "Tavern", folder: "b", tags: ["town", "night"], favorite: true },
  { id: "2", name: "Road", folder: "a", tags: ["travel"] },
  { id: "3", name: "Title", folder: null, tags: [] },
  { id: "4", name: "Lost", folder: "missing", tags: ["town"] }
];

test("buildTree nests folders, counts items and survives cycles and orphans", () => {
  const tree = buildTree(folders, records);
  assert.deepEqual(tree.items.map(i => i.id), ["4", "3"].sort((x, y) => records.find(r => r.id === x).name.localeCompare(records.find(r => r.id === y).name)));
  const act = tree.children.find(n => n.folder.id === "a");
  assert.equal(act.count, 2);
  assert.equal(act.children[0].folder.id, "b");
  assert.equal(act.children[0].depth, 1);
  assert.ok(tree.children.some(n => n.folder.id === "e"), "orphan at root");
  assert.ok(!tree.children.some(n => n.folder.id === "c"), "cycle folders never reach the root");
});

test("matchesFilter by query, tags and favorites", () => {
  assert.equal(matchesFilter(records[0], { query: "tav" }), true);
  assert.equal(matchesFilter(records[0], { query: "nig" }), true);
  assert.equal(matchesFilter(records[1], { tags: ["town"] }), false);
  assert.equal(matchesFilter(records[0], { tags: ["Town", "night"] }), true);
  assert.equal(matchesFilter(records[1], { favorites: true }), false);
});

test("collectTags orders by frequency", () => {
  assert.deepEqual(collectTags(records), ["town", "night", "travel"]);
});
