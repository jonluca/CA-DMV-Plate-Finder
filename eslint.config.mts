import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import prettierExtends from "eslint-config-prettier";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, "unused-imports": unusedImportsPlugin },
    extends: ["js/recommended", prettierExtends],
    languageOptions: { globals: globals.node },
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
