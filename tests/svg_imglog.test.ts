// svg_imglog.test.ts — the global log names what an AI source regeneration
// spent (user report 2026-10-19: "logs do not contain how much the
// regeneration cost and tokens spent"). Reported numbers stay reported; a
// number the provider did not send is "—" / "no cost reported", never invented.
import { describe, expect, it } from "vitest";
import { imageItemSpec, imageRunSpec, imageSpendLine } from "../src/svg/imglog";
import type { ImageRegenResult } from "../src/svg/imgrunner";

const MODEL = "openai/gpt-image-2.5-sunburst";
const usage = (input: number, output: number, cost: number | null) => ({ input, output, total: input + output, cost, currency: "USD" });

const ok: ImageRegenResult = { id: "fog", status: "done", requestId: "req-1", usage: usage(1000, 4000, 0.12) };
const ok2: ImageRegenResult = { id: "sun", status: "done", requestId: null, usage: usage(500, 2000, 0.06) };
const bad: ImageRegenResult = { id: "moon", status: "failed", error: "the image request failed (HTTP 402)" };

describe("one entry per regenerated source", () => {
  it("names tokens in/out/total and the reported cost", () => {
    const spec = imageItemSpec(ok, MODEL);
    expect(spec).toMatchObject({ level: "info", feature: "svg", action: "image-regen-item", ids: { source: "fog", request: "req-1" } });
    expect(spec.detail).toMatch(/1,000 in · 4,000 out · 5,000 tokens · \$0\.1200 reported/);
    expect(spec.data).toMatchObject({ tokensIn: 1000, tokensOut: 4000, tokens: 5000, cost: 0.12, currency: "USD", model: MODEL });
  });

  it("a failure is an error entry with its reason and no invented spend", () => {
    const spec = imageItemSpec(bad, MODEL);
    expect(spec.level).toBe("error");
    expect(spec.detail).toMatch(/HTTP 402/);
    expect(spec.detail).toMatch(/— tokens · no cost reported/);
    expect(spec.data).toMatchObject({ tokens: null, cost: null });
  });
});

describe("the run summary sums the spend", () => {
  it("totals every request's tokens and cost", () => {
    expect(imageSpendLine([ok, ok2, bad], MODEL)).toBe("1,500 in · 6,000 out · 7,500 tokens · $0.1800 reported");
    const spec = imageRunSpec([ok, ok2, bad], MODEL, { done: 2, failed: 1 });
    expect(spec).toMatchObject({ feature: "svg", action: "image-regen", level: "warn" });
    expect(spec.detail).toBe("2 done, 1 failed · 1,500 in · 6,000 out · 7,500 tokens · $0.1800 reported");
    expect(spec.data).toMatchObject({ done: 2, failed: 1, tokens: 7500, cost: 0.18, model: MODEL });
  });

  it("nothing reported -> says so", () => {
    expect(imageSpendLine([bad], MODEL)).toBe("— in · — out · — tokens · no cost reported");
  });
});
