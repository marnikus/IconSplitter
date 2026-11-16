#!/usr/bin/env node
// tools/verify.mjs — the cross-platform RULE 16 lane runner (CODE_VERIFICATION.md §8).
// Replaces tools/pre_push_check.sh: one identical gate for cmd, PowerShell, bash
// and agent sandboxes, with no duplicated test lane — the coverage lane already
// executes every test, so the fast path runs the suite exactly once.
//
//   node tools/verify.mjs                  # fast lanes (every commit)
//   node tools/verify.mjs --cold           # bypass static/transform caches (all gates still run)
//   node tools/verify.mjs --overlap        # opt-in native quarantine + bounded static/suite overlap
//   node tools/verify.mjs --serial         # canonical sequential fallback / comparison control
//   node tools/verify.mjs --full           # + uninstrumented perf-budget lane (pre-push)
//   node tools/verify.mjs --base <ref>     # passes --base to the quality lane (shallow clones)
//   node tools/verify.mjs --plan [--json]  # prints the lane plan and runs nothing (test seam)
//
// The lane plan is a contract: tests/verify_runner.test.ts characterizes it.
import { canOverlapVerification, runVerification } from "./verify-execution.mjs";
import { fileURLToPath } from "node:url";

// fileURLToPath: URL.pathname is "/D:/My%20Dir/" on Windows, an invalid cwd.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const full = args.includes("--full");
const cold = args.includes("--cold");
const planOnly = args.includes("--plan");
const jsonOut = args.includes("--json");
const overlap = args.includes("--overlap") && !args.includes("--serial") && canOverlapVerification();

/** `--base <ref>` passthrough for the quality lane; empty when not given. */
function baseArgs() {
  const i = args.indexOf("--base");
  return i >= 0 && args[i + 1] ? ["--base", args[i + 1]] : [];
}

function lanePlan() {
  const typeCache = cold ? [] : ["--incremental", "--tsBuildInfoFile", "node_modules/.cache/verify/types.tsbuildinfo"];
  const lintCache = cold ? [] : ["--cache", "--cache-strategy", "content", "--cache-location", "node_modules/.cache/verify/eslint"];
  const testCache = cold ? ["--fsModuleCache=false"] : [];
  return [
    { name: "Types", cmd: "npx", args: ["tsc", "--noEmit", ...typeCache] },
    { name: "Lint", cmd: "npx", args: ["eslint", "src", "tests", "tools", "--max-warnings", "1000", ...lintCache] },
    { name: "Quality gate (changed)", cmd: "node", args: ["tools/quality.mjs", "--changed", "--allow-legacy", ...baseArgs()] },
    // --full adds the wall-clock budgets WITHOUT coverage instrumentation: the
    // native project only (TEST_HARNESS.md) — the coverage lane already runs
    // every test, so a second full-suite lane would be pure duplication.
    ...(full ? [{ name: "Perf budgets (native, uninstrumented)", cmd: "npx", args: ["vitest", "run", "--project", "native", ...testCache] }] : []),
    // PERF_BUDGETS tells wall-clock alarms (algo_efficiency) that instrumentation inflates every run.
    { name: "Tests + coverage", cmd: "npx", args: ["vitest", "run", "--coverage", ...testCache], env: { PERF_BUDGETS: "coverage" } },
    { name: "Build", cmd: "npm", args: ["run", "build"] },
  ].map(lane => ({ ...lane, executionGroup: lane.name.startsWith("Perf budgets") ? "native"
    : lane.name === "Tests + coverage" ? "suite" : "static", executionMode: overlap ? "overlap" : "serial" }));
}

function printPlan(lanes) {
  if (jsonOut) console.log(JSON.stringify(lanes, null, 2));
  else {
    console.log("Execution groups: with --overlap, native runs alone then static queue and complete suite overlap. Default/--serial uses canonical order.");
    lanes.forEach((l, i) => console.log(`${i + 1}/${lanes.length} ${l.name}: ${l.cmd} ${l.args.join(" ")} [${l.executionGroup}]`));
  }
}

const lanes = lanePlan();
if (planOnly || jsonOut) {
  printPlan(lanes);
  process.exit(0);
}
const controller = new globalThis.AbortController();
const onInterrupt = () => controller.abort("SIGINT");
const onTerminate = () => controller.abort("SIGTERM");
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);
console.log(overlap ? "Execution: native alone; static/build queue overlaps complete coverage suite."
  : "Execution: serial (default, --serial override, or resource fallback).");
const failed = await runVerification(lanes, ROOT, overlap, controller.signal);
process.removeListener("SIGINT", onInterrupt);
process.removeListener("SIGTERM", onTerminate);
console.log(failed === 0
  ? "\nALL LANES PASSED"
  : `\n${failed} LANE(S) FAILED — fix in RULE 19 order (nesting → CC → cognitive → size) before pushing.`);
process.exitCode = controller.signal.aborted ? (controller.signal.reason === "SIGTERM" ? 143 : 130) : failed === 0 ? 0 : 1;
