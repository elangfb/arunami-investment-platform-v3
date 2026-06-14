import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import nx from "@nx/eslint-plugin";

const eslintConfig = defineConfig([
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    settings: {
      next: {
        rootDir: "apps/web-app/",
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
        },
      ],
    },
  },
  {
    // Unit tests (node:test) — allow non-null assertions on asserted values.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
  ]),
]);

export default eslintConfig;
