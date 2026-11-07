// builder-fast-test.mjs — build one Node-runnable ESM bundle from the real TS
// builder modules and run its assertions without Vitest workers/VM contexts.
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "node_modules/.cache/builder-fast.mjs");
const hookStub = path.resolve(root, "tools/builder-fast-hook.ts");

const stubBuilderHook = {
  name: "stub-builder-hook",
  setup(builder) {
    builder.onResolve({ filter: /(^|\/)useSvgBuilder$/ }, (args) => {
      if (args.importer.endsWith("SvgBuilderPanel.tsx")) return { path: hookStub };
      return undefined;
    });
  },
};

const started = performance.now();
await build({
  absWorkingDir: root,
  entryPoints: [path.resolve(root, "tools/builder-fast.spec.ts")],
  outfile: out,
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  loader: { ".css": "empty" },
  packages: "external",
  plugins: [stubBuilderHook],
  logLevel: "silent",
}).then(async (result) => {
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, result.outputFiles[0].text, "utf8");
});

const module = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
const result = await module.runFastBuilderTests();
const ms = performance.now() - started;
console.log(`Builder fast lane: ${result.passed} passed, ${result.failed} failed in ${ms.toFixed(1)}ms`);
for (const failure of result.failures) console.error(`  ✗ ${failure}`);
if (result.failed > 0) process.exitCode = 1;
