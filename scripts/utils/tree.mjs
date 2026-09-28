/**
 * Folder tree building and filtering for the library browser (pure).
 */

/**
 * @typedef {object} TreeNode
 * @property {object} folder
 * @property {TreeNode[]} children
 * @property {object[]} items
 * @property {number} count     Items in this folder and all sub-folders
 * @property {number} depth
 */

/**
 * Build a folder tree for one record type.
 * @param {object[]} folders   Folder records of the matching type
 * @param {object[]} records   Records with a `folder` field
 * @returns {{children: TreeNode[], items: object[]}}   Root level
 */
export function buildTree(folders, records) {
  const byParent = new Map();
  const ids = new Set(folders.map(f => f.id));
  for ( const folder of folders ) {
    // Orphaned or self-referencing folders go to the root
    const parent = folder.parent && ids.has(folder.parent) && folder.parent !== folder.id ? folder.parent : null;
    if ( !byParent.has(parent) ) byParent.set(parent, []);
    byParent.get(parent).push(folder);
  }
  const itemsByFolder = new Map();
  for ( const record of records ) {
    const key = record.folder && ids.has(record.folder) ? record.folder : null;
    if ( !itemsByFolder.has(key) ) itemsByFolder.set(key, []);
    itemsByFolder.get(key).push(record);
  }
  const sort = (a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || a.name.localeCompare(b.name);
  const visited = new Set();
  const build = (parent, depth) => (byParent.get(parent) ?? []).sort(sort).flatMap(folder => {
    if ( visited.has(folder.id) ) return []; // cycle guard
    visited.add(folder.id);
    const children = build(folder.id, depth + 1);
    const items = (itemsByFolder.get(folder.id) ?? []).sort(sort);
    const count = items.length + children.reduce((n, c) => n + c.count, 0);
    return [{ folder, children, items, count, depth }];
  });
  return { children: build(null, 0), items: (itemsByFolder.get(null) ?? []).sort(sort) };
}

/**
 * Whether a record matches a search query and filters.
 * @param {object} record
 * @param {object} filter
 * @param {string} [filter.query]
 * @param {string[]} [filter.tags]        All of these tags must be present
 * @param {boolean} [filter.favorites]    Only favorites
 * @returns {boolean}
 */
export function matchesFilter(record, { query = "", tags = [], favorites = false } = {}) {
  if ( favorites && !record.favorite ) return false;
  const recordTags = (record.tags ?? []).map(t => t.toLowerCase());
  if ( tags.some(t => !recordTags.includes(t.toLowerCase())) ) return false;
  const q = query.trim().toLowerCase();
  if ( !q ) return true;
  return record.name.toLowerCase().includes(q) || recordTags.some(t => t.includes(q));
}

/**
 * All tags used by a list of records, sorted by frequency then name.
 * @param {object[]} records
 * @returns {string[]}
 */
export function collectTags(records) {
  const counts = new Map();
  for ( const r of records ) for ( const t of r.tags ?? [] ) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).map(([t]) => t);
}
