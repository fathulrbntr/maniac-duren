import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "pos/vendor/**",
      "maniac-foto-*/**",
    ],
  },
  {
    files: [
      "pos/**/*.{js,mjs}",
      "menu/**/*.{js,mjs}",
      "shared/**/*.mjs",
      "script.js",
      "pos-recovery.mjs",
      "api/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-undef": "error",
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-dupe-else-if": "error",
      "no-redeclare": "error",
      "no-duplicate-imports": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-const-assign": "error",
      "no-cond-assign": ["error", "except-parens"],
      "valid-typeof": "error",
      "constructor-super": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["api/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  { files: ["menu/logic.js"], languageOptions: { globals: globals.commonjs } },
];
