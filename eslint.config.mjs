import js from "@eslint/js";
import globals from "globals";

const foundryGlobals = Object.fromEntries([
  "foundry", "game", "canvas", "ui", "CONFIG", "CONST", "Hooks", "PIXI",
  "_del", "_replace", "_loc", "fromUuid", "fromUuidSync"
].map(name => [name, "readonly"]));

export default [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...foundryGlobals }
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "prefer-const": "warn",
      "eqeqeq": ["error", "smart"]
    }
  },
  {
    files: ["tools/**/*.mjs", "tests/**/*.mjs", "*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node }
  }
];
