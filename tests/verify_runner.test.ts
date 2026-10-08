// tools/verify.mjs — the cross-platform RULE 16 lane runner (CODE_VERIFICATION.md §8).
// These tests spawn the REAL runner in --plan mode and characterize its contract:
// which lanes run in fast mode, which in --full mode, in which order, and with
// which arguments the quality gate is invoked. RULE 8: no mocks — if the runner
// ever re-adds the duplicated test lane of the old pre_push_check.sh (lanes 4+5
// both ran the whole suite), the first test below fails.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Lane = { name: string; cmd: string; args: string[] };

function plan(...flags: string[]): Lane[] {
  const r = spawnSync(process.execPath, ["tools/verify.mjs", "--plan", "--json", ...flags], {
    encoding: "utf8",
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Lane[];
}

const vitestLanes = (lanes: Lane[]): Lane[] => lanes.filter((l) => l.args.includes("vitest"));
const qualityLane = (lanes: Lane[]): Lane | undefined =>
  lanes.find((l) => l.name === "Quality gate (changed)");

describe("fast lane plan (npm run verify:fast)", () => {
  it("executes the suite exactly once: the only vitest lane is the coverage one", () => {
    const lanes = vitestLanes(plan());
    expect(lanes).toHaveLength(1);
    expect(lanes[0].args).toContain("--coverage");
  });

  it("keeps the lane order types → lint → quality gate → coverage → build", () => {
    expect(plan().map((l) => l.name)).toEqual([
      "Types",
      "Lint",
      "Quality gate (changed)",
      "Tests + coverage",
      "Build",
    ]);
  });

  it("passes --changed --allow-legacy to the quality lane", () => {
    expect(qualityLane(plan())?.args).toEqual(["tools/quality.mjs", "--changed", "--allow-legacy"]);
  });

  it("forwards --base <ref> to the quality lane for shallow clones (O8)", () => {
    const quality = qualityLane(plan("--base", "origin/main"));
    expect(quality?.args.slice(3)).toEqual(["--base", "origin/main"]);
  });
});

describe("full lane plan (npm run verify, pre-push hook)", () => {
  it("adds the standalone test lane before the coverage lane", () => {
    const lanes = plan("--full");
    expect(vitestLanes(lanes)).toHaveLength(2);
    expect(lanes.map((l) => l.name)).toEqual([
      "Types",
      "Lint",
      "Quality gate (changed)",
      "Tests",
      "Tests + coverage",
      "Build",
    ]);
  });
});

describe("--plan mode itself", () => {
  it("prints only the plan JSON and executes no lane", () => {
    const r = spawnSync(process.execPath, ["tools/verify.mjs", "--plan", "--json"], {
      encoding: "utf8",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trimStart().startsWith("[")).toBe(true);
    expect(r.stdout).not.toContain("PASS");
  });

  it("prints a human-readable lane list without --json", () => {
    const r = spawnSync(process.execPath, ["tools/verify.mjs", "--plan"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("1/5 Types");
    expect(r.stdout).toContain("npx tsc --noEmit");
  });
});
