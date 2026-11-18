// affected-tests.mjs — the everyday-retest scoping lane (docs/current/CODE_VERIFICATION.md).
// A change reruns exactly the tests that can observe it, and EVERYTHING when the
// change is harness-wide, outside the import graph, or cannot be resolved.
// Scoping is a convenience for local iteration: `npm run verify` and CI still run
// the complete suite, and no test is ever dropped from a gate.
//
//   node tools/affected-tests.mjs                     # list what the working tree affects
//   node tools/affected-tests.mjs --run               # ...and run it
//   node tools/affected-tests.mjs --base <ref> --json # explicit compare ref, machine output
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CODE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const RESOLVE_EXT = [...CODE_EXT, ".json"];
// Anything that changes how EVERY test runs, not just the tests that import it.
const HARNESS_WIDE = [
  /^vitest\.config\.ts$/, /^vite\.config\.ts$/, /^tests\/setup\//, /^package(-lock)?\.json$/,
  /^tsconfig.*\.json$/, /^eslint\.config\./, /^\.github\//, /^public\//, /^design\//,
  /^tools\/(quality|verify|test-harness-policy|harness-benchmark|affected-tests)\./,
];
// Roots the graph understands; a change anywhere else escalates.
const KNOWN_ROOTS = [/^src\//, /^tests\//, /^tools\//, /^docs\//];
const TEST_FILE = /^tests\/.*\.test\.[cm]?[jt]sx?$/;
// A ref travels into `git diff` — accept only ref-shaped text.
const REF_SHAPED = /^[\w./-]+$/;

export const isTestFile = (path) => TEST_FILE.test(path);

/** Every module specifier a source file mentions, in any of the forms this repo uses. */
export function specifiersOf(source) {
  const found = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bvi\.(?:mock|importActual)\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) found.add(m[1]);
  return [...found];
}

const toPosix = (p) => p.split(/[\\/]/).join("/");

/** Repo-relative target of a specifier, or null for a bare package / node builtin. */
export function resolveSpecifier(spec, fromFile, known) {
  const alias = spec.startsWith("@/");
  if (!alias && !spec.startsWith(".")) return null;
  const base = alias ? posix.join("src", spec.slice(2)) : posix.join(posix.dirname(toPosix(fromFile)), spec);
  const target = posix.normalize(base);
  if (target.startsWith("..")) return null;
  const seen = (p) => (known instanceof Set || known instanceof Map ? known.has(p) : existsSync(resolvePath(ROOT, p)));
  for (const cand of [target, ...RESOLVE_EXT.map((e) => target + e), ...CODE_EXT.map((e) => posix.join(target, `index${e}`))]) {
    if (seen(cand)) return cand;
  }
  return null;
}

/** Forward and reverse import edges over a set of sources (path -> text). */
export function buildGraph(sources) {
  const known = sources instanceof Map ? new Set(sources.keys()) : new Set(Object.keys(sources));
  const forward = new Map();
  const reverse = new Map();
  for (const [file, source] of sources instanceof Map ? sources : Object.entries(sources)) {
    const deps = new Set();
    for (const spec of specifiersOf(String(source))) {
      const target = resolveSpecifier(spec, file, known);
      if (target !== null && target !== file) deps.add(target);
    }
    forward.set(file, deps);
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(file);
    }
  }
  return { forward, reverse };
}

/** Tests that read documentation pages by path (a docs change is their input). */
function docReadingTests(sources) {
  const out = [];
  for (const [file, source] of sources) if (isTestFile(file) && String(source).includes("docs/")) out.push(file);
  return out;
}

/** Every test that can observe `path`, walking importers transitively. */
function observableTests(path, reverse) {
  const seen = new Set();
  const queue = [path];
  while (queue.length > 0) {
    const next = queue.shift();
    for (const importer of reverse.get(next) ?? []) {
      if (seen.has(importer)) continue; // cycles terminate here
      seen.add(importer);
      queue.push(importer);
    }
  }
  return [...seen].filter(isTestFile);
}

/**
 * The tests a set of changed paths requires. `all:true` means run the complete
 * suite: the honest answer whenever scoping cannot prove a test is unaffected.
 */
export function selectTests(changed, options = {}) {
  const sources = options.sources ?? new Map();
  const exists = options.exists ?? ((p) => sources.has(p));
  const escalate = (reason) => ({ all: true, reasons: [reason], tests: [] });
  if (options.unresolvedBase) return escalate("the compare base could not be resolved");
  if (changed.length === 0) return { all: false, reasons: ["nothing changed"], tests: [] };

  const missing = changed.filter((p) => !exists(p));
  if (missing.length > 0) return escalate(`missing from the tree, so a deletion rewires its importers: ${missing.join(", ")}`);
  const wide = changed.filter((p) => HARNESS_WIDE.some((re) => re.test(p)));
  if (wide.length > 0) return escalate(`harness-wide, every test runs it: ${wide.join(", ")}`);
  const outside = changed.filter((p) => !KNOWN_ROOTS.some((re) => re.test(p)));
  if (outside.length > 0) return escalate(`outside the graph's known roots: ${outside.join(", ")}`);

  const { reverse } = buildGraph(sources);
  const selected = new Set();
  for (const path of changed) {
    if (path.startsWith("docs/")) {
      for (const t of docReadingTests(sources)) selected.add(t);
      continue;
    }
    if (isTestFile(path)) selected.add(path);
    for (const t of observableTests(path, reverse)) selected.add(t);
  }
  return { all: false, reasons: [], tests: [...selected].sort() };
}

/** Reads every code file the graph covers in this repository. */
export function collectRepo(root = ROOT) {
  const sources = new Map();
  for (const dir of ["src", "tests", "tools"]) {
    const abs = resolvePath(root, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { recursive: true })) {
      const rel = toPosix(join(dir, entry));
      const full = resolvePath(root, rel);
      if (!CODE_EXT.some((e) => rel.endsWith(e)) || !statSync(full).isFile()) continue;
      sources.set(rel, readFileSync(full, "utf8"));
    }
  }
  return { sources, root };
}

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

/** The compare ref: --base, else the merge base with origin/main, else HEAD~1. */
function compareBase(argValue) {
  if (argValue !== undefined) {
    if (!REF_SHAPED.test(argValue)) return { base: null, why: `--base "${argValue}" is not a git ref` };
    return { base: argValue, why: null };
  }
  const merge = git(["merge-base", "origin/main", "HEAD"]);
  if (merge) return { base: merge, why: null };
  if (git(["rev-parse", "--verify", "HEAD~1"])) return { base: "HEAD~1", why: null };
  return { base: null, why: "no merge base with origin/main and no HEAD~1 (shallow clone?)" };
}

/** Changed paths of the working tree against the base, plus untracked files. */
function changedPaths(base) {
  const tracked = base === null ? [] : git(["diff", "--name-only", base]).split("\n").filter(Boolean).map(toPosix);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean).map(toPosix);
  return [...new Set([...tracked, ...untracked])];
}

function main(argv) {
  const argValue = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const asJson = argv.includes("--json");
  const run = argv.includes("--run");
  const explicit = argValue("--files");
  const { base, why } = compareBase(argValue("--base"));
  const changed = explicit !== undefined ? explicit.split(",").filter(Boolean).map(toPosix) : changedPaths(base);
  const repo = collectRepo();
  const out = base === null && explicit === undefined
    ? { all: true, reasons: [why ?? "the compare base could not be resolved"], tests: [] }
    : selectTests(changed, { sources: repo.sources, exists: (p) => existsSync(resolvePath(ROOT, p)) });

  const allTests = [...repo.sources.keys()].filter(isTestFile).sort();
  const tests = out.all ? allTests : out.tests;
  if (asJson) {
    console.log(JSON.stringify({ all: out.all, reasons: out.reasons, changed, base, selected: tests.length, total: allTests.length, tests }, null, 2));
  } else {
    const pct = allTests.length > 0 ? Math.round((1 - tests.length / allTests.length) * 100) : 0;
    console.log(out.all ? `affected: COMPLETE suite (${allTests.length} files) — ${out.reasons.join("; ")}`
      : `affected: ${tests.length} of ${allTests.length} test files (-${pct}%)`);
    for (const reason of out.reasons) console.log(`  why: ${reason}`);
    for (const path of changed) console.log(`  changed: ${path}`);
    if (!out.all) for (const t of tests) console.log(`  run: ${t}`);
  }
  if (!run) return 0;
  const done = spawnSync("npx", ["vitest", "run", ...tests], { cwd: ROOT, stdio: "inherit" });
  return done.status ?? 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

export { ROOT };
