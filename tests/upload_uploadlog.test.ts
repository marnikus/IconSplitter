// upload_uploadlog.test.ts — CP-1 (merge-report §9, T13): the tab's CLOSED log
// vocabulary. Every entry the tab can emit is one of six outcomes, every entry
// names the icon or the run it belongs to, and NONE has a `data` field — the
// metadata text, the prompt, the response body and the API key have no field to
// ride in. The last test reads the tab's own sources: a future `log({...})`
// literal outside this module fails the build, not a review.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  UPLOAD_FEATURE, UPLOAD_LOG_ACTIONS, cancelledSpec, exportedSpec, modelCheckedSpec,
  nameRefusedSpec, namedSpec, restoredSpec,
} from "../src/upload/uploadlog";

const REF = { id: "pair_abc", base: "fog_AI" };
const MODES = "clear, simple, minimal"; // deliberately not a secret: only a detail

const ALL = [
  namedSpec({ ...REF, model: "gemini-3.1-flash-lite", tags: 40 }),
  nameRefusedSpec({ ...REF, why: "the answer did not have the three labeled lines" }),
  exportedSpec({ ...REF, status: "processed", note: "export.json was written last" }),
  cancelledSpec(3),
  restoredSpec(2),
  modelCheckedSpec({ model: "gemini-3.1-flash-lite", ok: true, reason: "" }),
];

describe("the vocabulary is closed", () => {
  it("every builder emits one of the six actions (T13)", () => {
    for (const spec of ALL) {
      expect(UPLOAD_LOG_ACTIONS).toContain(spec.action);
    }
    const emitted = new Set(ALL.map((s) => s.action));
    expect([...emitted].sort()).toEqual([...UPLOAD_LOG_ACTIONS].sort());
  });

  it("no entry carries a data field, and no extra key sneaks in", () => {
    const allowed = new Set(["level", "feature", "action", "ids", "detail"]);
    for (const spec of ALL) {
      const keys = Object.keys(spec);
      expect(keys).not.toContain("data");
      for (const key of keys) expect(allowed.has(key)).toBe(true);
    }
    expect(JSON.stringify(ALL)).not.toContain("\"data\":");
  });

  it("the icon entries name the icon and the outcome; the run entries name the count", () => {
    expect(namedSpec({ ...REF, model: "m", tags: 40 }).ids).toEqual({ pair: REF.id, base: REF.base });
    expect(nameRefusedSpec({ ...REF, why: MODES }).ids).toEqual({ pair: REF.id, base: REF.base });
    expect(exportedSpec({ ...REF, status: "processed", note: "n" }).ids).toEqual({ pair: REF.id, base: REF.base });
    expect(restoredSpec(2).ids).toEqual({ interrupted: 2 });
    expect(cancelledSpec(3).ids).toEqual({ stopped: 3 });
  });

  it("every entry has the feature, a detail line and a level the outcome justifies", () => {
    for (const spec of ALL) {
      expect(spec.feature).toBe(UPLOAD_FEATURE);
      expect(typeof spec.detail).toBe("string");
      expect((spec.detail ?? "").length).toBeGreaterThan(0);
    }
    expect(exportedSpec({ ...REF, status: "processed", note: "n" }).level).toBe("info");
    expect(exportedSpec({ ...REF, status: "partial", note: "n" }).level).toBe("warn");
    expect(exportedSpec({ ...REF, status: "failed", note: "n" }).level).toBe("error");
  });
});

describe("the module lock — nobody else writes the tab's log", () => {
  const dir = join(process.cwd(), "src", "upload");

  it("no source file in src/upload writes a log literal outside uploadlog.ts (T13)", () => {
    const offenders = readdirSync(dir)
      .filter((name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && name !== "uploadlog.ts")
      .filter((name) => /\blog\(\{/.test(readFileSync(join(dir, name), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("every log(...) call site is fed by this module's builders — never an inline literal", () => {
    for (const name of readdirSync(dir).filter((n) => (n.endsWith(".ts") || n.endsWith(".tsx")) && n !== "uploadlog.ts")) {
      const source = readFileSync(join(dir, name), "utf8");
      for (const match of source.matchAll(/\blog\(/g)) {
        const window = source.slice(match.index ?? 0, (match.index ?? 0) + 240);
        expect(window, `${name} log() site`).toContain("Spec(");
        expect(window, `${name} log() site`).not.toContain("feature:");
      }
    }
  });
});
