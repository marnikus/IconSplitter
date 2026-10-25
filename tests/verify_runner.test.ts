// @vitest-environment node
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

  it("keeps canonical inventory types → lint → quality gate → coverage → build (execution groups control scheduling)", () => {
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
  it("adds only the uninstrumented native project before coverage — never a second full suite", () => {
    const lanes = plan("--full");
    expect(vitestLanes(lanes)).toHaveLength(2);
    expect(lanes.map((l) => l.name)).toEqual([
      "Types",
      "Lint",
      "Quality gate (changed)",
      "Perf budgets (native, uninstrumented)",
      "Tests + coverage",
      "Build",
    ]);
    expect(lanes[3].args).toEqual(["vitest", "run", "--project", "native"]);
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

describe("honest incremental static checks and explicit cold verification", () => {
  it("uses compiler-owned incremental checking and content-keyed lint cache, never a cached test success", () => {
    const lanes = plan("--full");
    expect(lanes[0].args).toContain("--incremental");
    expect(lanes[0].args).toContain("--tsBuildInfoFile");
    expect(lanes[1].args).toContain("--cache");
    expect(lanes[1].args).toContain("content");
    expect(lanes.find((l) => l.name === "Tests + coverage")?.args).toEqual(["vitest", "run", "--coverage"]);
    expect(lanes.at(-1)?.name).toBe("Build");
  });

  it("cold mode bypasses static and transform caches but keeps every gate", () => {
    const cold = plan("--full", "--cold");
    expect(cold.map((l) => l.name)).toEqual(plan("--full").map((l) => l.name));
    expect(cold[0].args).not.toContain("--incremental");
    expect(cold[1].args).not.toContain("--cache");
    for (const lane of vitestLanes(cold)) expect(lane.args).toContain("--fsModuleCache=false");
  });
});

describe('explicit execution groups for bounded full verification overlap', () => {
  it('exposes native quarantine, one static queue and one complete coverage queue', () => {
    const lanes = plan('--full') as (Lane & { executionGroup: string })[];
    expect(lanes.find(l => l.name.startsWith('Perf budgets'))?.executionGroup).toBe('native');
    expect(lanes.find(l => l.name === 'Tests + coverage')?.executionGroup).toBe('suite');
    expect(lanes.filter(l => l.executionGroup === 'static').map(l => l.name)).toEqual(['Types', 'Lint', 'Quality gate (changed)', 'Build']);
  });
});


it('keeps serial as the explicit/default machine-readable execution mode', () => {
  for (const flags of [[], ['--serial'], ['--overlap', '--serial']]) {
    const lanes = plan(...flags) as (Lane & {executionMode: string})[];
    expect(lanes.every(l => l.executionMode === 'serial')).toBe(true);
  }
});
