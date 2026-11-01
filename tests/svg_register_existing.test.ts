// svg_register_existing.test.ts — Generate SVG: take SVGs that are ALREADY in the
// folder into the pair's history (user request 2026-11-01). One file becomes v1,
// several become the versions their names say, and the newest one is made the
// shown/accepted version — exactly what generating them in the tab would leave.
import { describe, expect, it } from "vitest";
import { importSummary, newestReadable, planImport, relatedTo } from "../src/lib/svgimport";
import { svgVersion } from "./helpers/svgpair";

const SVG = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;

describe("which files belong to the pair", () => {
  it("takes the stem's own file and the suffixes a tool or a copy leaves behind", () => {
    expect(relatedTo("fog_AI", "fog_AI.svg")).toBe(true);
    expect(relatedTo("fog_AI", "fog_AI_v3.svg")).toBe(true);
    expect(relatedTo("fog_AI", "fog_AI-copy.svg")).toBe(true);
    expect(relatedTo("fog_AI", "fog_AI (1).svg")).toBe(true);
    expect(relatedTo("fog_AI", "fog_AI2.svg")).toBe(false);
  });

  it("ignores the pair file, other pairs' artwork and non-SVG files", () => {
    expect(relatedTo("fog_AI", "fog_AI.svg.json")).toBe(false);
    expect(relatedTo("fog_AI", "court_AI.svg")).toBe(false);
    expect(relatedTo("fog_AI", "fog_AI.png")).toBe(false);
    expect(relatedTo("", "fog_AI.svg")).toBe(false);
  });
});

describe("planning the versions a folder already holds", () => {
  it("registers a single file as v1 — the record a generation would write", () => {
    const plan = planImport("fog_AI", ["fog_AI.png", "fog_AI.svg", "fog_AI.svg.json"], []);
    expect(plan.fresh).toEqual([{ name: "fog_AI.svg", version: 1 }]);
    expect(plan.known).toEqual([]);
    expect(plan.latest).toBe(1);
  });

  it("numbers several files by their names and reports the newest", () => {
    const plan = planImport("fog_AI", ["fog_AI.svg", "fog_AI_v3.svg", "fog_AI_v2.svg"], []);
    expect(plan.fresh.map((f) => [f.name, f.version])).toEqual([
      ["fog_AI.svg", 1], ["fog_AI_v2.svg", 2], ["fog_AI_v3.svg", 3],
    ]);
    expect(plan.latest).toBe(3);
  });

  it("gives an unnumbered copy the next free number instead of dropping it", () => {
    const plan = planImport("fog_AI", ["fog_AI.svg", "fog_AI_v2.svg", "fog_AI-copy.svg"], []);
    expect(plan.fresh.map((f) => f.version)).toEqual([1, 2, 3]);
    expect(plan.fresh[2].name).toBe("fog_AI-copy.svg");
    expect(plan.latest).toBe(3);
  });

  it("never re-adds a file the pair file already records, and keeps counting from it", () => {
    const history = [svgVersion("architecture/fog_AI.svg", { version: 1 })];
    const plan = planImport("fog_AI", ["fog_AI.svg", "fog_AI_v2.svg"], history);
    expect(plan.fresh).toEqual([{ name: "fog_AI_v2.svg", version: 2 }]);
    expect(plan.known).toEqual(["fog_AI.svg"]);
    expect(plan.latest).toBe(2);
  });

  it("reports nothing to do for a folder without an SVG of this pair", () => {
    const plan = planImport("fog_AI", ["fog_AI.png", "court_AI.svg"], []);
    expect(plan.fresh).toEqual([]);
    expect(plan.latest).toBeNull();
  });

  it("shows the newest version that is actually readable", () => {
    const versions = [
      svgVersion("a/v1.svg", { version: 1 }),
      svgVersion("a/v3.svg", { version: 3, status: "failed", valid: false }),
    ];
    expect(newestReadable(versions)).toBe(1);
    expect(newestReadable([])).toBeNull();
  });
});

describe("what the one line says", () => {
  it("names the count and the version now shown", () => {
    expect(importSummary({ registered: 3, skipped: 0, folders: 2, shown: 3 }).text)
      .toBe("3 existing SVGs registered — v3 is now shown");
    expect(importSummary({ registered: 1, skipped: 0, folders: 1, shown: 1 }).text)
      .toBe("1 existing SVG registered — v1 is now shown");
  });

  it("says plainly when a file was skipped, and never claims a registration", () => {
    const partial = importSummary({ registered: 1, skipped: 2, folders: 1, shown: 1 });
    expect(partial.text).toContain("1 existing SVG registered");
    expect(partial.text).toContain("2 skipped (not a valid SVG)");
    expect(partial.err).toBe(false);
    const none = importSummary({ registered: 0, skipped: 2, folders: 1, shown: null });
    expect(none.err).toBe(true);
    expect(none.text).toBe("2 SVG files found but none could be registered");
  });

  it("does not call an empty folder an error", () => {
    const empty = importSummary({ registered: 0, skipped: 0, folders: 1, shown: null });
    expect(empty).toEqual({ text: "No existing SVG in 1 selected folder", err: false });
  });
});

describe("the fixture stays honest", () => {
  it("one document is valid SVG the tab can show", () => {
    expect(SVG("#c22f2f")).toContain("<path");
  });
});
