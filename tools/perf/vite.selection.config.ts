// Production-mode counterpart of the dev fixture; compare the same baseline/ref and current tree.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
const root = process.cwd();
const ref = process.env.SELECTION_BENCH_REF;
const outDir = process.env.SELECTION_BENCH_OUT;
if (!outDir) throw new Error("Set SELECTION_BENCH_OUT to an external benchmark output directory");
const output = resolve(outDir);
if (output === root || output.startsWith(root + "/") || root.startsWith(output + "/")) {
  throw new Error("Benchmark output must be external, never the repository or an ancestor");
}
export default defineConfig({
  root, base: "./",
  plugins: [
    { name: "selection-baseline-source", enforce: "pre", load(id) {
      if (!ref || !id.startsWith(resolve(root, "src") + "/") || id.includes("?")) return null;
      return execFileSync("git", ["show", `${ref}:${relative(root, id)}`], { encoding: "utf8" });
    } }, react(), tailwind(),
  ],
  build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, "tools/perf/selection-response.html") } },
});
