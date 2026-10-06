// TDD cycle 5 — output planning (spec §5): month/timestamp layout, per-source
// folders, collision → _v02/_v03, never overwriting existing names.
import { describe, expect, it } from "vitest";
import { planBatch, type BatchSource } from "../src/lib/output";

const src = (relPath: string, ref: string | null = null): BatchSource => ({
  relPath,
  name: relPath.split("/").pop()!,
  relDir: relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "",
  refRelPath: ref,
});

const date = new Date(2026, 8, 30, 14, 32, 8);

describe("planBatch — layout (spec §5 + ROOT FOLDER EXAMPLE)", () => {
  it("groups by month then timestamped batch, preserving source hierarchy", () => {
    const plan = planBatch([src("Category-A/icon-award-ribbon_AI.png")], () => [], date);
    expect(plan.relBase).toBe("2026-09/2026-09-30_14-32-08");
    expect(plan.items[0].relDir).toBe("Category-A");
    expect(plan.items[0].folder).toBe("icon-award-ribbon_AI");
    expect(plan.items[0].relFolder).toBe("2026-09/2026-09-30_14-32-08/Category-A/icon-award-ribbon_AI");
  });

  it("keeps existing variant suffixes untouched", () => {
    const plan = planBatch([src("a/x_AI_7.png")], () => [], date);
    expect(plan.items[0].folder).toBe("x_AI_7");
  });

  it("colliding folder names get _v02, _v03 — never overwrite", () => {
    const sources = [src("a/icon_AI.png"), src("b/icon_AI.png"), src("c/icon_AI.png")];
    // all three land in the same output dir "a" per this plan call shape
    const plan = planBatch(sources.map((s) => ({ ...s, relDir: "a" })), () => [], date);
    expect(plan.items.map((i) => i.folder)).toEqual(["icon_AI", "icon_AI_v02", "icon_AI_v03"]);
  });

  it("existing folders in the destination are honoured (skip ahead)", () => {
    const existing = (relDir: string) => (relDir === "a" ? ["icon_AI", "icon_AI_v02"] : []);
    const plan = planBatch([src("a/icon_AI.png")], existing, date);
    expect(plan.items[0].folder).toBe("icon_AI_v03");
  });

  it("carries reference path through for the copy step", () => {
    const plan = planBatch([src("a/x_AI.png", "a/x.png")], () => [], date);
    expect(plan.items[0].refRelPath).toBe("a/x.png");
  });
});
