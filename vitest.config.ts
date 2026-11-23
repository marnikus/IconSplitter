import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import { coveragePolicy, harnessProjects, mainWorkerBudget } from "./tools/test-harness-policy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// See docs/current/TEST_HARNESS.md: isolated VM contexts share only external packages;
// geometry then native/perf groups follow without competing pools. No tests, source scope or gates are omitted.
export default defineConfig({
  // Tests compile JSX with the production transform (jsx/jsxs, not jsxDEV),
  // matching what `npm run build` ships. NODE_ENV stays "test" here: setting it
  // to production in the CONFIG process breaks vite's resolution of node:
  // builtins ("Cannot find package 'node:'"). The worker gets production React
  // through test.env below instead.
  esbuild: { jsxDev: false },
  resolve: { alias: [
    // Harness redesign 2026-11-17: tests run React's PRODUCTION builds (see
    // process.env.NODE_ENV below and tests/setup/reactprod.ts). Prod react ships
    // no `act`, so "react" resolves to the harness shim that re-exports the real
    // module and adds ONE act. Everything else resolves natively: react-dom and
    // scheduler read NODE_ENV themselves and land on the same prod copies, so
    // there is exactly one React instance (path-aliasing the prod cjs files gave
    // react-dom the DEV react and crashed with a null dispatcher).
    { find: /^react$/, replacement: path.resolve(__dirname, "tests/setup/reactprod.ts") },
    { find: /^react-prod$/, replacement: path.resolve(__dirname, "node_modules/react/index.js") },
    { find: "@", replacement: path.resolve(__dirname, "src") },
  ] },
  test: {
    // React, react-dom and scheduler each pick their build from NODE_ENV when
    // they are first required, and they require each other natively (aliases do
    // not reach inside an externalised package). Only a worker-wide production
    // NODE_ENV makes all three land on ONE production copy; aliasing the prod
    // cjs files by path left react-dom on the dev react and every hook read a
    // null dispatcher. No source or test branches on NODE_ENV (verified).
    env: { NODE_ENV: "production" },
    silent: "passed-only",
    environment: "happy-dom",
    setupFiles: ["tests/setup/harness.ts"],
    isolate: true,
    maxWorkers: mainWorkerBudget(),
    vmMemoryLimit: "768MB",
    testTimeout: 30000,
    fsModuleCache: true,
    projects: harnessProjects(),
    // Instrument selected app sources, not every loaded React/DOM module at runtime.
    // --coverage.provider=v8 remains available for independent accounting audits.
    coverage: coveragePolicy,
  },
});
