import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // testRun.ts is a deliberate "menu" of demo entry points — many are
  // imported only for their side effect of being available to call at the
  // top-level. Allow unused locals there without weakening the global rule.
  {
    files: ["scripts/testRun.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
