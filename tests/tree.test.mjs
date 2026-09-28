import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTree, matchesFilter, collectTags, sortRecords, folderPath, folderDescendants
} from "../scripts/utils/tree.mjs";

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

test("sortRecords by name (natural), reverse name and recency", () => {
  const list = [
    { name: "Hill 10", modified: 1 }, { name: "hill 2", modified: 3 }, { name: "Forest", modified: 2 }
  ];
  assert.deepEqual(sortRecords(list).map(r => r.name), ["Forest", "hill 2", "Hill 10"]);
  assert.deepEqual(sortRecords(list, "-name").map(r => r.name), ["Hill 10", "hill 2", "Forest"]);
  assert.deepEqual(sortRecords(list, "recent").map(r => r.name), ["hill 2", "Forest", "Hill 10"]);
  assert.equal(list[0].name, "Hill 10", "input is not mutated");
});

test("folderPath walks up to the root and survives cycles", () => {
  const byId = Object.fromEntries(folders.map(f => [f.id, f]));
  assert.deepEqual(folderPath(byId, "b").map(f => f.id), ["a", "b"]);
  assert.deepEqual(folderPath(byId, null), []);
  assert.equal(folderPath(byId, "c").length, 2);
});

test("folderDescendants includes nested folders", () => {
  assert.deepEqual([...folderDescendants(folders, "a")].sort(), ["a", "b"]);
});
