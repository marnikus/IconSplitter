// upload_rowbadge_store.test.ts — persist/reload of upload row badges (RULE 13).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addBadge, EMPTY_ROW_BADGES, toggleBadgeOn } from "../src/lib/upload/rowbadge";
import {
  getRowBadgeState, loadRowBadges, resetRowBadges, ROW_BADGES_KEY, setRowBadgeState, subscribeRowBadges,
} from "../src/upload/rowbadgestore";

beforeEach(() => {
  localStorage.clear();
  resetRowBadges();
});

afterEach(() => {
  localStorage.clear();
  resetRowBadges();
});

describe("row badge store", () => {
  it("round-trips a catalog and assignments", () => {
    const catalog = addBadge(EMPTY_ROW_BADGES, "Priority", "#ff5b7e");
    if (!catalog) throw new Error("add");
    const assigned = toggleBadgeOn(catalog, "pair_fog", "rb1");
    setRowBadgeState(assigned);
    expect(JSON.parse(localStorage.getItem(ROW_BADGES_KEY) ?? "{}").catalog[0].name).toBe("Priority");
    resetRowBadges();
    expect(getRowBadgeState()).toEqual(EMPTY_ROW_BADGES);
    expect(loadRowBadges()).toEqual(assigned);
  });

  it("corrupt JSON becomes the empty catalog, never a throw", () => {
    localStorage.setItem(ROW_BADGES_KEY, "{not json");
    expect(loadRowBadges()).toEqual(EMPTY_ROW_BADGES);
  });

  it("notifies subscribers on write and reloads a foreign version as empty", () => {
    let n = 0;
    const unsub = subscribeRowBadges(() => { n += 1; });
    const catalog = addBadge(EMPTY_ROW_BADGES, "Priority", "#ff5b7e");
    if (!catalog) throw new Error("add");
    setRowBadgeState(catalog);
    expect(n).toBe(1);
    unsub();
    localStorage.setItem(ROW_BADGES_KEY, JSON.stringify({ v: 9, catalog: catalog.catalog }));
    expect(loadRowBadges()).toEqual(EMPTY_ROW_BADGES);
  });
});
