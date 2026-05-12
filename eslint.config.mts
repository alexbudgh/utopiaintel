import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    // 1. Global ignores (Keep this first!)
    ignores: [
      ".next/*",
      "node_modules/*",
      ".claude/*",
      "out/*",
      "public/*",
      "**/*.json", // Skip large JSON data files
    ],
  },
  // 2. Base JS & TS Recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 3. React Recommended
  pluginReact.configs.flat.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // 4. The "Best Practice" Next.js sets
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // 5. Necessary overrides for Next.js 16
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off", // Since you use TypeScript
    },
  },
]);
