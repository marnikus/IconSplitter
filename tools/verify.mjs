#!/usr/bin/env node
// tools/verify.mjs — the cross-platform RULE 16 lane runner (CODE_VERIFICATION.md §8).
// Replaces tools/pre_push_check.sh: one identical gate for cmd, PowerShell, bash
// and agent sandboxes, with no duplicated test lane — the coverage lane already
// executes every test, so the fast path runs the suite exactly once.
//
//   node tools/verify.mjs                  # fast lanes (every commit)
//   node tools/verify.mjs --full           # + uninstrumented perf-budget lane (pre-push)
//   node tools/verify.mjs --base <ref>     # passes --base to the quality lane (shallow clones)
//   node tools/verify.mjs --plan [--json]  # prints the lane plan and runs nothing (test seam)
//
// The lane plan is a contract: tests/verify_runner.test.ts characterizes it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// fileURLToPath: URL.pathname is "/D:/My%20Dir/" on Windows, an invalid cwd.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const full = args.includes("--full");
const planOnly = args.includes("--plan");
const jsonOut = args.includes("--json");

/** `--base <ref>` passthrough for the quality lane; empty when not given. */
function baseArgs() {
  const i = args.indexOf("--base");
  return i >= 0 && args[i + 1] ? ["--base", args[i + 1]] : [];
}

function lanePlan() {
  return [
    { name: "Types", cmd: "npx", args: ["tsc", "--noEmit"] },
    { name: "Lint", cmd: "npx", args: ["eslint", "src", "tests", "tools", "--max-warnings", "1000"] },
    { name: "Quality gate (changed)", cmd: "node", args: ["tools/quality.mjs", "--changed", "--allow-legacy", ...baseArgs()] },
    // --full adds the wall-clock budgets WITHOUT coverage instrumentation: the
    // native project only (TEST_HARNESS.md) — the coverage lane already runs
    // every test, so a second full-suite lane would be pure duplication.
    ...(full ? [{ name: "Perf budgets (native, uninstrumented)", cmd: "npx", args: ["vitest", "run", "--project", "native"] }] : []),
    // PERF_BUDGETS tells wall-clock alarms (algo_efficiency) that instrumentation inflates every run.
    { name: "Tests + coverage", cmd: "npx", args: ["vitest", "run", "--coverage"], env: { PERF_BUDGETS: "coverage" } },
    { name: "Build", cmd: "npm", args: ["run", "build"] },
  ];
}

function printPlan(lanes) {
  if (jsonOut) console.log(JSON.stringify(lanes, null, 2));
  else lanes.forEach((l, i) => console.log(`${i + 1}/${lanes.length} ${l.name}: ${l.cmd} ${l.args.join(" ")}`));
}

function runLane(lane, i, total) {
  console.log(`\n=== ${i + 1}/${total} ${lane.name} (${lane.cmd} ${lane.args.join(" ")}) ===`);
  const started = Date.now();
  const r = spawnSync(lane.cmd, lane.args, { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32", env: { ...process.env, ...lane.env } });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`=== ${lane.name}: ${r.status === 0 ? "PASS" : "FAIL"} (${secs}s) ===`);
  return r.status === 0;
}

const lanes = lanePlan();
if (planOnly || jsonOut) {
  printPlan(lanes);
  process.exit(0);
}
// map() runs the lanes sequentially, in order; each returns PASS/FAIL.
const failed = lanes.map((lane, i) => runLane(lane, i, lanes.length)).filter((ok) => !ok).length;
console.log(failed === 0
  ? "\nALL LANES PASSED"
  : `\n${failed} LANE(S) FAILED — fix in RULE 19 order (nesting → CC → cognitive → size) before pushing.`);
process.exit(failed === 0 ? 0 : 1);
