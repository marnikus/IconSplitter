// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMPTY_ROW_BADGES,
  HARDCODED_STOCK_BADGES,
  addBadge,
  assignNamedBadge,
  badgesOf,
  ensureHardcodedBadges,
  rowMatchesBadge,
} from "../src/lib/upload/rowbadge";

describe("unified general row-badge system with hardcoded stock badges", () => {
  it("has no split stockbadges module and defines Shutterstock, Adobe Stock & Getty Images in rowbadge.ts", () => {
    expect(existsSync(path.resolve("src/lib/stockupload/stockbadges.ts"))).toBe(false);
    expect(HARDCODED_STOCK_BADGES).toEqual([
      { id: "shutterstock", name: "Shutterstock", color: "#ff4b4b" },
      { id: "adobe-stock", name: "Adobe Stock", color: "#3898ff" },
      { id: "getty-images", name: "Getty Images", color: "#14c997" },
    ]);
  });

  it("ensures hardcoded stock badges live alongside user badges in the one catalog and migrates legacy stock:* IDs", () => {
    const withUser = addBadge(EMPTY_ROW_BADGES, "Priority", "#745cff")!;
    const unified = ensureHardcodedBadges(withUser);
    expect(unified.catalog).toEqual([
      { id: "shutterstock", name: "Shutterstock", color: "#ff4b4b" },
      { id: "adobe-stock", name: "Adobe Stock", color: "#3898ff" },
      { id: "getty-images", name: "Getty Images", color: "#14c997" },
      { id: "rb1", name: "Priority", color: "#745cff" },
    ]);
    // Idempotent when already present
    expect(ensureHardcodedBadges(unified)).toBe(unified);

    // Legacy `stock:shutterstock` / `stock:getty-images` entries migrate cleanly into the single system
    const legacy = ensureHardcodedBadges({
      v: 1,
      catalog: [{ id: "stock:shutterstock", name: "Shutterstock", color: "#ff4b4b" }],
      assigned: { "icon-1": ["stock:shutterstock", "stock:getty-images"] },
    });
    expect(legacy.catalog.map((b) => b.id)).toEqual(["shutterstock", "adobe-stock", "getty-images"]);
    expect(badgesOf(legacy, "icon-1")).toEqual(["shutterstock", "getty-images"]);
  });

  it("assigns hardcoded or custom stock badges via the same general catalog and filters with rowMatchesBadge", () => {
    const start = ensureHardcodedBadges(addBadge(EMPTY_ROW_BADGES, "Ready", "#32d68b")!);
    const withReady = assignNamedBadge(start, "icon-1", "Ready");
    const afterShutter = assignNamedBadge(withReady, "icon-1", "Shutterstock", "shutterstock");
    const afterGetty = assignNamedBadge(afterShutter, "icon-1", "Getty Images", "getty-images");
    const afterCustom = assignNamedBadge(afterGetty, "icon-1", "Dreamstime", "dreamstime");

    expect(badgesOf(afterCustom, "icon-1")).toEqual(["rb1", "shutterstock", "getty-images", "dreamstime"]);
    expect(afterCustom.catalog.some((b) => b.id === "dreamstime" && b.name === "Dreamstime")).toBe(true);
    expect(rowMatchesBadge(badgesOf(afterCustom, "icon-1"), "getty-images")).toBe(true);
    expect(rowMatchesBadge(badgesOf(afterCustom, "icon-1"), "adobe-stock")).toBe(false);
  });
});
