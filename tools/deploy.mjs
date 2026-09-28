/**
 * Copy the module into a Foundry Data/modules folder for testing (no build step needed).
 * Usage: FOUNDRY_MODULES_DIR=/path/to/Data/modules npm run deploy
 */
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const modulesDir = process.env.FOUNDRY_MODULES_DIR;
if ( !modulesDir || !existsSync(modulesDir) ) {
  console.error("Set FOUNDRY_MODULES_DIR to an existing Foundry Data/modules folder.");
  process.exit(1);
}
const target = join(modulesDir, "immersive-scenes");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for ( const entry of ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "scripts", "templates", "styles", "lang", "assets"] ) {
  cpSync(join(root, entry), join(target, entry), { recursive: true });
}
console.log(`Deployed to ${target}`);
