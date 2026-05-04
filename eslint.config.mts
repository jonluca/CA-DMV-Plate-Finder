import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import prettierExtends from "eslint-config-prettier";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "tsconfig.json", "tsconfig.tsbuildinfo", "bun.lock"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    plugins: { js, "unused-imports": unusedImportsPlugin },
    extends: ["js/recommended", prettierExtends],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "unused-imports/no-unused-imports": "error",
    },
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
]);
