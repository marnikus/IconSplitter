// tools/quality.mjs — the RULE 16 gate. Characterization tests for the
// shallow-clone fix (O8): --base <ref> diffs against an explicit ref with no
// merge-base, --files <list> gates an explicit list with no git at all, and a
// shallow repository that cannot compute a merge-base gets an honest hint
// instead of a silent "(none)" pass. All tests spawn the REAL gate (RULE 8);
// they were red before the flags existed, when a depth-1 sandbox made
// --changed measure nothing and still print GATE PASSED.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type GateResult = { file: string; failures: string[] };

function gate(...args: string[]) {
  return spawnSync(process.execPath, ["tools/quality.mjs", ...args], { encoding: "utf8" });
}

function isShallow(): boolean {
  const r = spawnSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" });
  return r.stdout.trim() === "true";
}

/** The gate hints only when it had to FALL BACK: a shallow clone whose history still reaches origin/main needs no hint. */
function hasMergeBase(): boolean {
  const r = spawnSync("git", ["merge-base", "origin/main", "HEAD"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() !== "";
}

describe("--files: explicit list, no git involved", () => {
  it("measures exactly the named src files", () => {
    const r = gate("--files", "src/lib/zoom.ts,src/lib/isrecord.ts", "--json");
    expect(r.status, r.stderr).toBe(0);
    const results = JSON.parse(r.stdout) as GateResult[];
    expect(results.map((x) => x.file)).toEqual(["src/lib/isrecord.ts", "src/lib/zoom.ts"]);
  });

  it("a non-src selection is an honest empty set, not an error (RULE 4)", () => {
    const r = gate("--files", "README.md");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("(none in src)");
    expect(r.stdout).toContain("GATE PASSED");
  });

  it("a named file that does not exist fails loudly — a typo is not an empty set", () => {
    const r = gate("--files", "src/lib/does_not_exist.ts");
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain("not found");
  });
});

describe("--base: explicit compare ref", () => {
  it("names the ref in the changed-files line with no merge-base needed", () => {
    const r = gate("--changed", "--allow-legacy", "--base", "HEAD");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("Changed files vs HEAD");
  });

  it("an unknown ref fails loudly instead of silently gating nothing", () => {
    const bogus = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const r = gate("--changed", "--base", bogus);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain(bogus);
  });
});

describe("shallow-clone honesty", () => {
  it("hints the fetch fix exactly when a merge-base is unavailable in a shallow repo", () => {
    const r = gate("--changed", "--allow-legacy");
    expect(r.status, r.stderr).toBe(0);
    if (isShallow() && !hasMergeBase()) {
      expect(r.stdout).toContain("shallow");
      expect(r.stdout).toContain("git fetch --depth");
    } else {
      expect(r.stdout).not.toContain("shallow clone");
    }
  });

  it("keeps the flag-less changed mode green on a clean src tree (characterization)", () => {
    const r = gate("--changed", "--allow-legacy");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("GATE PASSED");
  });
});
