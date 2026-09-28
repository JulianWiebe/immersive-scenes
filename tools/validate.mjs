/**
 * Static checks for the module package (run with `npm run validate`):
 * - every path referenced by module.json exists
 * - every template path referenced from scripts exists
 * - language files parse and contain every IMMERSIVE_SCENES.* key used in scripts and templates
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const errors = [];
const warnings = [];

const readJSON = path => {
  try { return JSON.parse(readFileSync(join(root, path), "utf8")); }
  catch(err) { errors.push(`${path}: ${err.message}`); return null; }
};

const walk = dir => {
  const out = [];
  if ( !existsSync(join(root, dir)) ) return out;
  for ( const name of readdirSync(join(root, dir)) ) {
    const rel = join(dir, name);
    if ( statSync(join(root, rel)).isDirectory() ) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
};

// Manifest
const manifest = readJSON("module.json");
if ( manifest ) {
  for ( const key of ["id", "title", "version", "compatibility", "esmodules"] ) {
    if ( !(key in manifest) ) errors.push(`module.json: missing "${key}"`);
  }
  const paths = [...(manifest.esmodules ?? []), ...(manifest.styles ?? []), ...(manifest.languages ?? []).map(l => l.path)];
  for ( const p of paths ) if ( !existsSync(join(root, p)) ) errors.push(`module.json: referenced file missing: ${p}`);
}

// Templates referenced in scripts
const scripts = walk("scripts").filter(f => f.endsWith(".mjs"));
const templates = walk("templates").filter(f => f.endsWith(".hbs"));
const sources = [...scripts, ...templates].map(f => ({ file: f, text: readFileSync(join(root, f), "utf8") }));
const templateRef = /modules\/immersive-scenes\/(templates\/[\w\-/]+\.hbs)/g;
for ( const { file, text } of sources ) {
  for ( const [, path] of text.matchAll(templateRef) ) {
    if ( !existsSync(join(root, path)) ) errors.push(`${file}: template not found: ${path}`);
  }
}

// Localization
const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) => {
  const key = prefix ? `${prefix}.${k}` : k;
  return (v && typeof v === "object") ? flatten(v, key) : [key];
});
const langs = {};
for ( const file of walk("lang").filter(f => f.endsWith(".json")) ) {
  const data = readJSON(file);
  if ( data ) langs[file] = new Set(flatten(data));
}
const en = langs["lang/en.json"];
if ( !en ) errors.push("lang/en.json missing");
else {
  const used = new Set();
  // Keys ending with "." are dynamic prefixes (e.g. `IMMERSIVE_SCENES.Mode.${mode}`) and are skipped.
  const keyRef = /IMMERSIVE_SCENES(?:\.[A-Za-z0-9_]+)+\.?/g;
  for ( const { file, text } of sources ) {
    for ( const [key] of text.matchAll(keyRef) ) {
      if ( key.endsWith(".") ) continue;
      used.add(key);
      if ( !en.has(key) && ![...en].some(k => k.startsWith(`${key}.`)) ) errors.push(`${file}: missing i18n key ${key}`);
    }
  }
  for ( const [file, keys] of Object.entries(langs) ) {
    if ( file === "lang/en.json" ) continue;
    const missing = [...en].filter(k => !keys.has(k));
    if ( missing.length ) warnings.push(`${file}: ${missing.length} keys missing (e.g. ${missing.slice(0, 3).join(", ")})`);
  }
}

for ( const w of warnings ) console.warn(`warn  ${w}`);
for ( const e of errors ) console.error(`error ${e}`);
console.log(`${relative(process.cwd(), root) || "."}: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
