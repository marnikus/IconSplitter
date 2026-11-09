import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_ROW_BADGES, assignNamedBadge, badgesOf, ensureHardcodedBadges, findNamedBadge } from "../src/lib/upload/rowbadge";
import {
  appendStockUploadBatch, getStockUploadBatches, loadStockUploadBatches, replaceStockUploadBatches, resetStockUploadBatches,
} from "../src/stockupload/batchhistorystore";
import { getStockHistory, loadStockHistory, markSitesRejected, recordSiteUploadStatus, resetStockHistory } from "../src/stockupload/historystore";
import {
  REJECTED_REASON, dropRejectedFromHistory, planRejectedRemoval, rejectedSummary, withoutStockBadge,
} from "../src/stockupload/rejectedremoval";

const ADOBE = { id: "p-adobe", name: "Adobe Stock" };

function run(id: string, stockId: string, files: Array<[string, string]>) {
  return {
    id, stockId, stockName: stockId, uploadedAt: "2026-11-09T15:00:00.000Z",
    uploadedCount: files.length, failedCount: 0, cancelled: false, rootPath: "",
    files: files.map(([itemId, fileName]) => ({ itemId, fileName, format: "eps" as const, relPath: null, fullPath: null })),
  };
}

const ok = { status: "uploaded" as const, formats: ["eps" as const], uploadedAt: "2026-11-09T15:00:00.000Z", error: null };

beforeEach(() => {
  localStorage.clear();
  resetStockUploadBatches();
  resetStockHistory();
});

describe("findNamedBadge", () => {
  it("finds a stock's badge by preset id, else by its name, and nothing for an unknown stock", () => {
    const state = ensureHardcodedBadges(EMPTY_ROW_BADGES);
    expect(findNamedBadge(state, "Adobe Stock", "p-adobe")?.id).toBe("adobe-stock");
    expect(findNamedBadge(state, "Renamed", "shutterstock")?.id).toBe("shutterstock");
    expect(findNamedBadge(state, "Dreamstime", "p-dream")).toBeNull();
  });
});

describe("withoutStockBadge", () => {
  it("removes only the chosen stock's badge from the matched items and counts who had it", () => {
    let state = assignNamedBadge(ensureHardcodedBadges(EMPTY_ROW_BADGES), "i1", "Adobe Stock", "p-adobe");
    state = assignNamedBadge(state, "i1", "Shutterstock", "shutterstock");
    state = assignNamedBadge(state, "i3", "Adobe Stock", "p-adobe");
    const res = withoutStockBadge(state, ADOBE, ["i1", "i2"]);
    expect(res.removed).toBe(1);
    expect(badgesOf(res.after, "i1")).toEqual(["shutterstock"]);
    expect(badgesOf(res.after, "i3")).toEqual(["adobe-stock"]);
  });

  it("leaves the state alone when no matched item has the badge", () => {
    const state = ensureHardcodedBadges(EMPTY_ROW_BADGES);
    expect(withoutStockBadge(state, ADOBE, ["i1"]).after).toBe(state);
  });
});

describe("history edits", () => {
  it("drops the items from that stock's runs, marks their saved status failed, and persists both", () => {
    appendStockUploadBatch(run("r1", "p-adobe", [["i1", "a.eps"], ["i2", "b.eps"]]));
    appendStockUploadBatch(run("r2", "shutterstock", [["i1", "a.eps"]]));
    recordSiteUploadStatus("i1", "p-adobe", ok);
    recordSiteUploadStatus("i1", "shutterstock", ok);

    const match = planRejectedRemoval({ stock: ADOBE, names: ["a.eps", "zzz.eps"], items: [] });
    expect(match.itemIds).toEqual(["i1"]);
    expect(dropRejectedFromHistory("p-adobe", match.itemIds)).toEqual({ historyFiles: 1, statuses: 1 });

    const saved = loadStockUploadBatches();
    expect(saved[0]).toMatchObject({ uploadedCount: 1, failedCount: 1 });
    expect(saved[1].files).toHaveLength(1);
    expect(loadStockHistory().i1).toMatchObject({ "p-adobe": { status: "failed", error: REJECTED_REASON }, shutterstock: { status: "uploaded" } });
  });

  it("markSitesRejected skips items without a status for that stock and already failed ones", () => {
    recordSiteUploadStatus("i1", "p-adobe", { ...ok, status: "failed" });
    expect(markSitesRejected(["i1", "i2"], "p-adobe", "x")).toBe(0);
    expect(getStockHistory().i2).toBeUndefined();
  });

  it("replaceStockUploadBatches ignores the unchanged array", () => {
    appendStockUploadBatch(run("r1", "p-adobe", [["i1", "a.eps"]]));
    const before = getStockUploadBatches();
    replaceStockUploadBatches(before);
    expect(getStockUploadBatches()).toBe(before);
  });
});

describe("rejectedSummary", () => {
  it("states badges, history files and unknown names", () => {
    expect(rejectedSummary("Adobe Stock", { items: 3, badges: 2, historyFiles: 4, statuses: 1, unmatched: ["x.eps"] }))
      .toBe("Adobe Stock: badge removed from 2 of 3 matched item(s), 4 history file(s) removed · 1 name(s) not found");
  });
});
