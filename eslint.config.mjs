import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import importPlugin from "eslint-plugin-import";
import noSecrets from "eslint-plugin-no-secrets";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import globals from "globals";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "out/**",
      "dist/**",
      "**/*.d.ts",
      "node_modules/**",
      "src/test/**",
      "jest*.config.js",
      "scripts/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.recommendedTypeChecked,
  prettierRecommended,

  {
    plugins: {
      "import": importPlugin,
      "no-secrets": noSecrets,
      "no-unsanitized": noUnsanitized,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='console']",
          message:
            "Don't use console directly. Use the functions from `src/utils/logging` instead.",
        },
      ],
      "camelcase": [2, { properties: "never" }],
      "no-underscore-dangle": ["error", { allowAfterThis: true }],
      "prefer-const": "error",
      "no-fallthrough": "warn",
      "no-param-reassign": "off",
      "no-use-before-define": "off",

      "import/no-duplicates": ["error"],
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: [
            "builtin",
            "external",
            "internal",
            "index",
            "parent",
            "sibling",
            "object",
            "type",
          ],
        },
      ],

      "no-unsanitized/property": "error",
      "no-secrets/no-secrets": [
        "error",
        {
          tolerance: 5,
          additionalRegexes: {
            "Dynatrace Token SSO": "dt0[a-zA-Z]{1}[0-9]{2}\\.[A-Z0-9]{8}\\.[A-Z0-9]{64}",
            "Dynatrace Token SSO Internal services":
              "dt0[a-zA-Z]{1}[0-9]{2}\\.[A-Za-z0-9\\-]+\\.[A-Z0-9]{64}",
            "Dynatrace Token Agents ODIN Agent Token v1":
              "dt0[a-zA-Z]{1}[0-9]{2}\\.[a-z0-9-]+\\.[A-Fa-f0-9]{64}",
            "Dynatrace Token Agents Tenant Token": "dt0[a-zA-Z]{1}[0-9]{2}\\.[a-zA-Z0-9]{24}",
            "Dynatrace Token Cluster REST APIs":
              "dt0[a-zA-Z]{1}[0-9]{2}\\.[A-Z0-9]{24}\\.[A-Z0-9]{64}",
          },
          ignoreContent: ["Win32_", "data:image/webp"],
        },
      ],

      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: [
            "classProperty",
            "objectLiteralProperty",
            "typeProperty",
            "classMethod",
            "objectLiteralMethod",
            "typeMethod",
            "accessor",
            "enumMember",
          ],
          format: null,
          modifiers: ["requiresQuotes"],
        },
      ],
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-redeclare": ["error", { builtinGlobals: false }],
      "@typescript-eslint/no-use-before-define": "off",
      "require-await": "off",
      "@typescript-eslint/require-await": "off",
    },
  },

  // Relax console restriction for specific files
  {
    files: ["src/utils/logging.ts", "test/**/*.test.ts", "**/__mocks__/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  // Runner files (headless command runner) — use tsconfig.runner.json
  // and need console for CI-visible output
  {
    files: ["runner/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.runner.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "no-restricted-syntax": "off",
    },
  },
);
