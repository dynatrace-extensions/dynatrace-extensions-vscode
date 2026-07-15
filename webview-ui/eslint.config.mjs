import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import importPlugin from "eslint-plugin-import";
import functional from "eslint-plugin-functional";
import noSecrets from "eslint-plugin-no-secrets";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import jsxA11y from "eslint-plugin-jsx-a11y";
import testingLibrary from "eslint-plugin-testing-library";
import redos from "eslint-plugin-redos";
import globals from "globals";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ["build/**", "node_modules/**", "dist/**", "scripts/**", "public/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.recommendedTypeChecked,

  // React flat config (eslint-plugin-react v7.37+)
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],

  // jsx-a11y flat config
  jsxA11y.flatConfigs.recommended,

  // sonarjs v4 flat config
  sonarjs.configs.recommended,

  prettierRecommended,

  {
    plugins: {
      import: importPlugin,
      functional,
      "no-secrets": noSecrets,
      "no-unsanitized": noUnsanitized,
      "react-hooks": reactHooks,
      "testing-library": testingLibrary,
      redos,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    settings: { react: { pragma: "React", version: "detect" } },
    rules: {
      "camelcase": [2, { properties: "never" }],
      "no-underscore-dangle": ["error", { allowAfterThis: true }],
      "prefer-const": "error",
      "no-fallthrough": "warn",
      "no-param-reassign": "off",
      "no-alert": "warn",
      "no-eval": "error",

      "import/no-duplicates": ["error"],
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "/e2e/**/*ts",
            "/api-test/**",
            "**/*.test.tsx",
            "**/*.test.ts",
            "**/*.spec.ts",
            "**/*.spec.tsx",
            "/src/testing/**",
            "/widgets/testing/**",
            "**/setupJest.ts",
            "**/setupJest.js",
            "**/*.stories.tsx",
          ],
        },
      ],
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", "index", "parent", "sibling", "object", "type"],
        },
      ],

      "functional/no-let": "warn",
      "functional/no-throw-statements": "error",

      // sonarjs v4 rules
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-template-literals": "warn",
      // TODO comments are valid in development; not a blocking issue
      "sonarjs/todo-tag": "warn",
      // Deprecated third-party APIs we don't control (e.g. dynatrace strato components)
      "sonarjs/deprecation": "warn",

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "react/no-unescaped-entities": "warn",
      "react/jsx-no-leaked-render": "warn",
      "react/prop-types": "warn",
      "react/no-danger": "error",
      "react/no-unsafe": "error",
      "react/no-typos": "warn",
      "react/no-invalid-html-attribute": "warn",
      "react/jsx-no-script-url": "error",
      "react/jsx-no-target-blank": [
        "error",
        { allowReferrer: false, enforceDynamicLinks: "always", warnOnSpreadAttributes: true },
      ],

      "no-unsanitized/property": "error",
      "no-unsanitized/method": "error",

      "no-secrets/no-secrets": [
        "error",
        {
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
        },
      ],

      "redos/no-vulnerable": "error",

      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-use-before-define": ["error", { functions: false }],
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-redeclare": ["error", { builtinGlobals: false }],
    },
  },

  // Testing-library rules for test files
  {
    files: ["**/*.test.tsx", "**/*.test.ts", "**/*.spec.tsx", "**/*.spec.ts"],
    ...testingLibrary.configs["flat/react"],
  },
);
