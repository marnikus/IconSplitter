import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/log/**"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // RULE 16.3 — line coverage of src/lib (and of the log, whose wiring is not
        // otherwise in the lane) never decreases vs baseline.
        lines: 80,
      },
    },
  },
});
