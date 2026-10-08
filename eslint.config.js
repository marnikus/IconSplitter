// ESLint flat config — code-quality lane of RULE 16 (AGENT_RULES.md).
// Hard fail lines for new code (function LOC >30, params >4) are enforced by
// tools/quality.mjs with the baseline ratchet; ESLint owns complexity,
// nesting depth and general hygiene.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // RULE 16.2 — cyclomatic complexity fail line 10, nesting fail line 4.
      // Warn (not error) so legacy hotspots stay lintable; tools/quality.mjs
      // owns the hard fail + ratchet for new/changed code.
      complexity: ["warn", 10],
      "max-depth": ["warn", 4],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // RULE 16.0 — tests and tools are out of scope for size/CC gates.
    files: ["tests/**", "tools/**", "*.config.{js,ts}"],
    rules: {
      complexity: "off",
      "max-depth": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Node scripts (gate, hooks installer) run outside the browser.
    files: ["tools/**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);
