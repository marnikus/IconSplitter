import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import { coveragePolicy, harnessProjects, mainWorkerBudget } from "./tools/test-harness-policy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// See docs/current/TEST_HARNESS.md: isolated VM contexts share only external packages;
// native realm/perf files follow serially. No tests, source scope or gates are omitted.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    silent: "passed-only",
    environment: "happy-dom",
    setupFiles: ["tests/setup/harness.ts"],
    isolate: true,
    maxWorkers: mainWorkerBudget(),
    fsModuleCache: true,
    projects: harnessProjects(),
    // Instrument selected app sources, not every loaded React/DOM module at runtime.
    // --coverage.provider=v8 remains available for independent accounting audits.
    coverage: coveragePolicy,
  },
});
