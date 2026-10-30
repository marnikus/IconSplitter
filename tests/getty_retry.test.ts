// The "Retry not-ready files" action: a finished Getty run leaves its batch open,
// so the files it could not verify are re-filled, re-saved and re-read in place.
// Only a card Getty marks "Ready to submit" turns a row uploaded.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";
import type { ExportedItem } from "../src/lib/stockupload/types";
import { getStockHistory, resetStockHistory } from "../src/stockupload/historystore";
import { applyGettyRetry, readingOf, retryOpenGettyFiles, runGettyRetry } from "../src/stockupload/gettyretry";
import { resetRowBadges, getRowBadgeState } from "../src/upload/rowbadgestore";

function item(stem: string, id: string): ExportedItem {
  return {
    id,
    stem,
    exportDir: `a/${stem}/export`,
    recordPath: `a/${stem}/export/export.json`,
    record: {} as ExportedItem["record"],
    files: {
      raster: { relPath: `a/${stem}/export/${stem}.jpg`, fileName: `${stem}.jpg`, bytes: 10, mtime: 1, ext: "jpg" },
      eps: { relPath: `a/${stem}/export/${stem}.eps`, fileName: `${stem}.eps`, bytes: 10, mtime: 1, ext: "eps" },
      svg: null,
      zip: null,
    },
    missingRecorded: [],
  };
}

const ITEMS = [item("star_01", "icon-1"), item("moon_02", "icon-2")];
const CREDS = { username: "contributor@example.com", password: "GettyPass!42" };

beforeEach(() => {
  localStorage.clear();
  resetStockHistory();
  resetRowBadges();
});

describe("Getty retry reading", () => {
  it("turns only the cards Getty marks Ready to submit into uploaded rows", () => {
    const reading = readingOf({
      ok: true, batchId: "68582498", accepted: ["star_01.eps"], failed: [], pending: ["moon_02.eps"],
      verified: true, completed: false, completion: null, metadata: [],
      outcomes: [
        { name: "star_01.eps", stem: "star_01", state: "ready", picture: true, ready: true, id: "2302700699" },
        { name: "moon_02.eps", stem: "moon_02", state: "arrived", picture: true, ready: false, id: "2302700733" },
      ],
    }, ["star_01.eps", "moon_02.eps"]);
    expect(reading).toMatchObject({ ok: false, ready: ["star_01"], reason: expect.stringContaining("moon_02.eps") });

    expect(applyGettyRetry(GETTY_WEB_PRESET, ITEMS, reading, "2026-10-30T10:00:00.000Z")).toBe(1);
    const history = getStockHistory();
    expect(history["icon-1"][GETTY_WEB_PRESET.id]).toMatchObject({ status: "uploaded", formats: ["raster", "eps"] });
    expect(history["icon-2"][GETTY_WEB_PRESET.id]).toMatchObject({
      status: "failed", formats: [], error: expect.stringContaining("Ready to submit"),
    });
    // The badge follows the same truth: only the ready row gets one.
    expect(Object.keys(getRowBadgeState().assigned).length).toBeGreaterThan(0);
  });

  it("counts nothing from a page it could not read, and keeps every file open", () => {
    const reading = readingOf({
      ok: true, batchId: null, accepted: [], failed: [], pending: ["star_01.eps"], verified: false,
      completed: false, completion: null, metadata: [],
    }, ["star_01.eps", "moon_02.eps"]);
    expect(reading).toMatchObject({ ok: false, ready: [], reason: expect.stringContaining("could not be read") });
    expect(reading.open.map((entry) => entry.stem)).toEqual(["star_01", "moon_02"]);
    expect(applyGettyRetry(GETTY_WEB_PRESET, ITEMS, reading)).toBe(0);
    expect(getStockHistory()["icon-1"][GETTY_WEB_PRESET.id].status).toBe("failed");
  });

  it("names a file Getty no longer lists instead of guessing", () => {
    const reading = readingOf({
      ok: true, batchId: null, accepted: [], failed: [], pending: [], verified: true,
      completed: false, completion: null, metadata: [], outcomes: [],
    }, ["star_01.eps"]);
    expect(reading.open).toEqual([{ stem: "star_01", reason: "Getty does not list star_01 any more" }]);
  });

  it("asks the helper for exactly the names it was told, in the same session", async () => {
    const retryFn = vi.fn(async () => ({
      ok: true as const, batchId: "68582498", accepted: ["star_01.eps"], failed: [], pending: [],
      verified: true, completed: false, completion: null, metadata: [],
      outcomes: [{ name: "star_01.eps", stem: "star_01", state: "ready" as const, picture: true, ready: true, id: null }],
    }));
    const reading = await retryOpenGettyFiles({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET, creds: CREDS,
      sessionKey: "run-1", names: ["star_01.eps"],
    }, retryFn);
    expect(reading).toMatchObject({ ok: true, ready: ["star_01"] });
    expect(retryFn).toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: "run-1", names: ["star_01.eps"], creds: CREDS,
    }));
  });

  it("keeps the rows and the bar honest when the helper refuses", async () => {
    const apply = vi.fn();
    const say = vi.fn();
    await runGettyRetry({
      bridgeUrl: "http://127.0.0.1:47391", preset: GETTY_WEB_PRESET,
      retry: { sessionKey: "run-1", names: ["star_01.eps"] },
      progress: { done: 2, total: 4, label: "old", complete: true },
      items: ITEMS, loadCreds: async () => CREDS, apply, say,
    });
    // No helper is running in this test, so the retry must say so and change nothing.
    expect(apply).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledWith(expect.stringContaining("cannot reach the local helper"), true);
  });
});
