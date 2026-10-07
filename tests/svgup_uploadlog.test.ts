// svgup_uploadlog.test.ts — the SVG-to-upload tab's log vocabulary (design §3).
// One entry per event, in the same shape the Generate SVG tab writes, and with
// the request's own rule enforced: a log line names the ICON and the OUTCOME —
// never the title, the description, the tags or the API key. The specs are pure
// data, so they are tested without a DOM and without the global store.
import { describe, expect, it } from "vitest";
import {
  acceptSpec, cancelSpec, exportSpec, providerSpec, rejectSpec, restoreSpec, UPLOAD_FEATURE,
} from "../src/svgupload/uploadlog";

/** Every spec the tab can write, so one field loop covers all of them. */
const ALL = [
  acceptSpec({ id: "pair_1", base: "icon-a_AI_1_01", model: "gemini-3.1-flash-lite", tags: 40 }),
  rejectSpec({ id: "pair_1", base: "icon-a_AI_1_01", why: "39 tags, expected 40" }),
  exportSpec({ id: "pair_1", base: "icon-a_AI_1_01", status: "processed", note: "Exported and verified." }),
  exportSpec({ id: "pair_1", base: "icon-a_AI_1_01", status: "failed", note: "No EPS converter is configured." }),
  cancelSpec(3),
  restoreSpec(2),
  providerSpec({ model: "gemini-3.1-flash-lite", ok: true, reason: "" }),
];

describe("the upload log vocabulary", () => {
  it("names the feature and the action for every entry", () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const spec of ALL) {
      expect(spec.feature).toBe(UPLOAD_FEATURE);
      expect(spec.action).toBeTruthy();
    }
  });

  it("keeps which icons were named, and the outcome of each run", () => {
    const accept = acceptSpec({ id: "pair_1", base: "icon-a_AI_1_01", model: "gemini-3.1-flash-lite", tags: 40 });
    expect(accept.action).toBe("named");
    expect(accept.ids).toEqual({ pair: "pair_1", base: "icon-a_AI_1_01" });
    expect(accept.detail ?? "").toContain("40");
    expect(accept.level).toBe("info");
  });

  it("writes a rejected answer as a warning that carries the policy's reason", () => {
    const reject = rejectSpec({ id: "pair_1", base: "icon-a_AI_1_01", why: "39 tags, expected 40" });
    expect(reject.level).toBe("warn");
    expect(reject.detail).toContain("39 tags");
  });

  it("writes a failed export as an error and a partial one as a warning", () => {
    const failed = exportSpec({ id: "p", base: "b", status: "failed", note: "no converter" });
    const partial = exportSpec({ id: "p", base: "b", status: "partial", note: "SVG + JPEG only" });
    const done = exportSpec({ id: "p", base: "b", status: "processed", note: "Exported and verified." });
    expect([failed.level, partial.level, done.level]).toEqual(["error", "warn", "info"]);
  });

  it("counts a cancel and a restore without naming any payload", () => {
    expect(cancelSpec(3).detail).toContain("3");
    expect(restoreSpec(2).detail).toContain("2");
    expect(restoreSpec(2).level).toBe("warn"); // unfinished work deserves to be seen
  });

  it("records a provider check with its verdict, not the key", () => {
    const bad = providerSpec({ model: "", ok: false, reason: "no model is verified" });
    expect(bad.level).toBe("warn");
    expect(JSON.stringify(bad)).not.toMatch(/apiKey|sk-|Bearer/);
  });

  it("never carries a payload field: no title, description or tags on any entry", () => {
    for (const spec of ALL) {
      // `data` is where a payload would leak. None of these entries may use it.
      expect(spec.data).toBeUndefined();
    }
  });
});
