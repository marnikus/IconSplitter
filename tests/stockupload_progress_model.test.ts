// @vitest-environment node
// The bar's display rules: a run is finished when it returns, never because a
// count reached its total, and a failure is never silent. Pure, so the rules are
// testable without mounting the panel.
import { describe, expect, it } from "vitest";
import { uploadBar } from "../src/stockupload/progressmodel";

const base = { done: 0, total: 14, label: "Getty Images (web upload): uploading 0 of 14 file(s)" };

describe("uploadBar", () => {
  it("keeps a running bar below 100 % even when every file is counted", () => {
    const bar = uploadBar({ ...base, done: 14, label: "10 of 14 file(s) ready to submit, 2 failed" });
    expect(bar.finished).toBe(false);
    expect(bar.percent).toBe(99);
    expect(bar.title).toBe("Uploading to stock sites");
    expect(bar.remaining).toBe(0);
  });

  it("keeps the running bar's percent proportional to verified outcomes", () => {
    const bar = uploadBar({ ...base, done: 7 });
    expect(bar.percent).toBe(50);
    expect(bar.finished).toBe(false);
  });

  it("names the failures while the run is still going", () => {
    const bar = uploadBar({ ...base, done: 12, failed: 2 });
    expect(bar.failed).toBe(true);
    expect(bar.title).toBe("Uploading to stock sites — 2 failed");
    expect(bar.finished).toBe(false);
  });

  it("is finished only when the run returns, and says so honestly", () => {
    expect(uploadBar({ ...base, done: 14, complete: true }).title).toBe("Upload complete");
    expect(uploadBar({ ...base, done: 14, complete: true, failed: 2 }).title).toBe("Upload finished with 2 failed");
    expect(uploadBar({ ...base, done: 14, complete: true, pending: 2 }).title).toBe("Upload finished — 2 not ready to submit");
    expect(uploadBar({ ...base, done: 6, complete: true, cancelled: true }).title).toBe("Upload cancelled");
  });

  it("never claims success on a finished run that left files unverified", () => {
    const bar = uploadBar({ ...base, done: 14, complete: true, unverified: 2 });
    expect(bar.title).toBe("Upload finished — 2 not verified");
    expect(bar.finished).toBe(true);
    expect(bar.percent).toBe(100);
  });

  it("offers the finished state only for a clean run at 100 %", () => {
    const clean = uploadBar({ ...base, done: 14, complete: true });
    expect(clean.percent).toBe(100);
    expect(clean.remaining).toBe(0);
    expect(clean.title).toBe("Upload complete");
  });
});
