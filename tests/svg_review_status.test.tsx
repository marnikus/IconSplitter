// svg_review_status.test.tsx — TDD for new review status "needs-review" (regenerated - new review)
// Yellow badge, automatic after regeneration, manual via row button.

import { describe, expect, it } from "vitest";
import { isReview, parseVersion, type SvgVersion } from "../src/lib/svgmodel";
import { tallyReviews } from "../src/lib/svgfile";
import { applySvgFilters, type SvgListRow } from "../src/lib/svglist";
import { saveSvgVersion } from "../src/svg/saveversion";
import { FakeDir } from "./helpers/fakefs";
import { svgSource } from "./helpers/svgpair";

describe("ReviewStatus — new status needs-review (regenerated - new review)", () => {
  it("isReview accepts needs-review", () => {
    expect(isReview("needs-review")).toBe(true);
    expect(isReview("pending")).toBe(true);
    expect(isReview("approved")).toBe(true);
    expect(isReview("declined")).toBe(true);
    expect(isReview("unknown")).toBe(false);
  });

  it("parseVersion accepts needs-review", () => {
    const raw = {
      version: 1,
      svgPath: "a/b.svg",
      status: "generated",
      review: "needs-review",
      prompt: "p",
      provider: "prov",
      model: "m",
      requestedAt: "2026-10-11T00:00:00.000Z",
      completedAt: null,
      usage: { input: 1, output: 1, total: 2 },
      cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
      validation: { ok: true, errors: [], warnings: [], icons: 1 },
      batch: null,
      error: null,
      requestId: null,
    };
    const parsed = parseVersion(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.review).toBe("needs-review");
  });

  it("tallyReviews counts needs-review", () => {
    const versions = [
      { review: "pending" },
      { review: "needs-review" },
      { review: "approved" },
      { review: "needs-review" },
    ] as unknown as SvgVersion[];
    const tally = tallyReviews(versions);
    expect(tally["needs-review"] ?? 0).toBe(2);
    expect(tally.pending).toBe(1);
    expect(tally.approved).toBe(1);
  });

  it("applySvgFilters filters needs-review", () => {
    const rows = [
      { id: "a", name: "a", relPath: "a", generation: "generated", review: "needs-review", generatedAt: 1, cost: null, costEstimated: false, tokens: null, version: 1 },
      { id: "b", name: "b", relPath: "b", generation: "generated", review: "approved", generatedAt: 1, cost: null, costEstimated: false, tokens: null, version: 1 },
    ] as unknown as SvgListRow[];
    const filtered = applySvgFilters(rows, { generation: "all", review: "needs-review" as any, search: "" });
    expect(filtered.map((r) => r.id)).toEqual(["a"]);
  });

  it("saveSvgVersion with needs-review sets review accordingly", async () => {
    const root = new FakeDir("root");
    await root.getDirectoryHandle("architecture", { create: true });
    const source = svgSource("pair_1", { name: "icon_AI.png" });
    const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10H0z"/></svg>';
    const out = await saveSvgVersion({
      root,
      source,
      code,
      prompt: "prompt",
      provider: "prov",
      model: "m",
      requestedAt: new Date().toISOString(),
      usage: { input: 1, output: 1, total: 2, cost: null, currency: "USD" },
      batch: null,
      requestId: null,
      meta: null,
      review: "needs-review" as any,
    });
    if (!out.ok) {
      console.log("save failed", (out as any).error);
    }
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.meta.versions[0].review).toBe("needs-review");
    }
  });

  it("saveSvgVersion defaults to pending when review not given", async () => {
    const root = new FakeDir("root");
    await root.getDirectoryHandle("architecture", { create: true });
    const source = svgSource("pair_2", { name: "icon2_AI.png" });
    const code = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10H0z"/></svg>';
    const out = await saveSvgVersion({
      root,
      source,
      code,
      prompt: "prompt",
      provider: "prov",
      model: "m",
      requestedAt: new Date().toISOString(),
      usage: { input: 1, output: 1, total: 2, cost: null, currency: "USD" },
      batch: null,
      requestId: null,
      meta: null,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.meta.versions[0].review).toBe("pending");
    }
  });
});
