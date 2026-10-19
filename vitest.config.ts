import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test harness layout (docs/current/TEST_HARNESS.md). Two projects, run as two
// sequential groups so each keeps one pool type (mixing pools respawns workers):
//  - main: every file on vmThreads. happy-dom and React are imported once per
//    worker instead of once per file (that import was ~65% of the old run),
//    while each file still gets a fresh VM context and module graph. A file
//    whose first line is `// @vitest-environment node` gets no DOM at all.
//  - native: files that need the real Node realm, on plain threads, after main:
//    wall-clock budgets (a VM context or a loaded CPU skews them) and code that
//    compares Node Buffers/typed arrays across realms.
const NATIVE = [
  "tests/algo_efficiency.test.ts",
  "tests/split_speed.test.ts",
  "tests/batch_perf_regression.test.tsx",
  "tests/real_grid_image.test.ts",
  "tests/fs.test.ts",
];

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    // Passing tests keep their console output to themselves: the DOM suites
    // emit thousands of React `act()` warnings, and streaming them all is what
    // used to leave an `onUserConsoleLog` message in flight when a worker was
    // torn down — vitest then reported `EnvironmentTeardownError: Closing rpc
    // while "onUserConsoleLog" was pending` and exited non-zero on a fully green
    // run (2026-10-08). A FAILING test still prints everything it logged.
    silent: "passed-only",
    environment: "happy-dom",
    setupFiles: ["tests/setup/harness.ts"],
    // Transformed modules persist in node_modules/.vitest-cache between runs.
    fsModuleCache: true,
    projects: [
      { extends: true, test: { name: "main", include: ["tests/**/*.test.{ts,tsx}"], exclude: NATIVE, pool: "vmThreads" } },
      { extends: true, test: { name: "native", include: NATIVE, pool: "threads", maxWorkers: 4, sequence: { groupOrder: 1 } } },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // RULE 16.3 — line coverage of src/lib never decreases vs baseline.
        lines: 80,
      },
    },
  },
});
