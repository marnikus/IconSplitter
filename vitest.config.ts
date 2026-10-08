import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Passing tests keep their console output to themselves: the DOM suites
    // emit thousands of React `act()` warnings, and streaming them all is what
    // used to leave an `onUserConsoleLog` message in flight when a worker was
    // torn down — vitest then reported `EnvironmentTeardownError: Closing rpc
    // while "onUserConsoleLog" was pending` and exited non-zero on a fully green
    // run (2026-10-08). A FAILING test still prints everything it logged.
    silent: "passed-only",
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
