// upload_remove_row.test.ts — "Remove" in SVG to upload and in Upload (2026-11-06),
// the same idea as Remove in Generate SVG: a row leaves a list by being
// DECLINED one step earlier. SVG to upload lists items approved in Generate SVG,
// so Remove there declines the item in Generate SVG. Upload lists exports, so
// Remove there declines the export's source item the same way — it leaves SVG to
// upload too, and Upload hides an export whose source is no longer approved.
// Both write Generate SVG's own decision ("svgReview") through its own path,
// record the same history entry (Undo approves again, Redo declines again), are
// refused while a row is busy, and record nothing when the write fails.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { withReview } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import type { ExportedItem } from "../src/lib/stockupload/types";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import type { HistoryEntry } from "../src/lib/history";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { applyEntry } from "../src/state/apply";
import { getAppState, patchStockUpload, patchUpload } from "../src/state/appstore";
import { onSvgReviewsWritten } from "../src/svg/reviewundo";
import { STOCK_UPLOAD_HANDLE_KEY } from "../src/stockupload/scan";
import { sourcePairsOf } from "../src/stockupload/sourcepairs";
import { reactToStockReviews, removeStockItems } from "../src/stockupload/removerows";
import { UPLOAD_HANDLE_KEY } from "../src/upload/scan";
import { reactToUploadReviews, removeUploadRows } from "../src/upload/removerows";
import type { UploadRow } from "../src/upload/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});
const handlesSpy = vi.mocked(loadHandles);

const DIR = "icons/cat";
const META = `${DIR}/cat_AI.svg.json`;
const ID = pairId(DIR, "cat", "");

function put(root: FakeDir, dirPath: string, name: string, text: string): void {
  let cur = root;
  for (const seg of dirPath.split("/").filter(Boolean)) {
    const next = cur.children.get(seg);
    if (next instanceof FakeDir) { cur = next; continue; }
    const made = new FakeDir(seg);
    cur.children.set(seg, made);
    cur = made;
  }
  cur.children.set(name, new FakeFile(name, text.length, 1000, text));
}

/** One pair `icons/cat` whose item is approved in Generate SVG, plus its committed export. */
async function workspace(review: "approved" | "declined" = "approved"): Promise<FakeDir> {
  const root = new FakeDir("root");
  put(root, DIR, "cat_AI.png", "png");
  await saveMetaAt(root, META, withReview(pairFile(DIR, "cat_AI.png"), review));
  const rec = newExportRecord({
    pair: { id: ID, base: "cat", suffix: "", dir: DIR },
    source: { svgPath: `${DIR}/cat_AI.svg`, version: 1, approval: "approved", fingerprint: "1:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: false, version: "3", config: "default", beforeBytes: 1, afterBytes: 1, beforeHash: "0", afterHash: "0" },
    epsEnabled: false, now: "2026-11-06T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-11-06T10:01:00.000Z";
  rec.outputs = { svg: null, jpg: { path: `${DIR}/export/cat_01.jpg`, bytes: 4, hash: "sha256:1" }, eps: null };
  const json = serializeExportRecord(rec);
  put(root, `${DIR}/export`, "export.json", json);
  put(root, `${DIR}/export`, "cat_01.jpg", "jpeg");
  return root;
}

function remember(key: string, root: FakeDir): void {
  handlesSpy.mockImplementation(async (k: string) => (k === key ? { source: root as never } : null));
}

async function reviewOf(root: FakeDir): Promise<string | undefined> {
  return (await loadMetaAt(root, META)).meta?.review;
}

function uploadRow(patch: Partial<UploadRow> = {}): UploadRow {
  return { source: { id: ID, metaPath: META, svgName: "cat_AI.svg" }, running: null, ...patch } as unknown as UploadRow;
}

function sink() {
  const pushed: HistoryEntry[] = [];
  const said: { msg: string; err: boolean }[] = [];
  return {
    pushed, said,
    say: (msg: string, err = false) => { said.push({ msg, err }); },
    hist: { push: (e: unknown) => { pushed.push(e as HistoryEntry); } },
  };
}

beforeEach(() => {
  handlesSpy.mockReset();
  handlesSpy.mockResolvedValue(null);
  patchUpload({ checked: [], activeId: null, anchorId: null });
  patchStockUpload({ checked: [], activeId: null, anchorId: null });
});

describe("Remove in SVG to upload", () => {
  it("declines the item in Generate SVG, records the svgReview entry and announces it", async () => {
    const root = await workspace();
    remember(UPLOAD_HANDLE_KEY, root);
    const s = sink();
    const heard: string[][] = [];
    const off = onSvgReviewsWritten((recs) => heard.push(recs.map((r) => `${r.id}:${r.review}`)));
    expect(await removeUploadRows({ rows: [uploadRow()], say: s.say, hist: s.hist }, [ID])).toBe(true);
    off();
    expect(await reviewOf(root)).toBe("declined");
    expect(heard).toEqual([[`${ID}:declined`]]);
    expect(s.pushed).toHaveLength(1);
    expect(s.pushed[0]).toMatchObject({ type: "svgReview", ids: [ID] });
    expect(s.said.at(-1)?.msg).toContain("declined in Generate SVG");
  });

  it("Undo approves the item again and Redo declines it again", async () => {
    const root = await workspace();
    remember(UPLOAD_HANDLE_KEY, root);
    const s = sink();
    await removeUploadRows({ rows: [uploadRow()], say: s.say, hist: s.hist }, [ID]);
    await expect(applyEntry(s.pushed[0], s.pushed[0].before)).resolves.toBe(true);
    expect(await reviewOf(root)).toBe("approved");
    await expect(applyEntry(s.pushed[0], s.pushed[0].after)).resolves.toBe(true);
    expect(await reviewOf(root)).toBe("declined");
  });

  it("refuses a row that is exporting or getting metadata, writing nothing", async () => {
    const root = await workspace();
    remember(UPLOAD_HANDLE_KEY, root);
    const s = sink();
    expect(await removeUploadRows({ rows: [uploadRow({ running: "export" })], say: s.say, hist: s.hist }, [ID])).toBe(false);
    expect(s.pushed).toHaveLength(0);
    expect(s.said.at(-1)?.err).toBe(true);
    expect(await reviewOf(root)).toBe("approved");
  });

  it("records nothing when the decision could not be written", async () => {
    await workspace(); // no folder remembered
    const s = sink();
    expect(await removeUploadRows({ rows: [uploadRow()], say: s.say, hist: s.hist }, [ID])).toBe(false);
    expect(s.pushed).toHaveLength(0);
    expect(s.said.at(-1)?.err).toBe(true);
  });

  it("the list drops a declined row and unchecks it; a re-approved missing row asks for a rescan", () => {
    patchUpload({ checked: [ID, "b"], activeId: ID, anchorId: ID });
    let rows = [uploadRow(), uploadRow({ source: { id: "b" } as UploadRow["source"] })];
    const setRowsFn = (fn: (r: UploadRow[]) => UploadRow[]) => { rows = fn(rows); };
    expect(reactToUploadReviews({ rows, setRowsFn }, [{ id: ID, review: "declined" }]).rescan).toBe(false);
    expect(rows.map((r) => r.source.id)).toEqual(["b"]);
    expect(getAppState().upload.checked).toEqual(["b"]);
    expect(getAppState().upload.activeId).toBeNull();
    expect(reactToUploadReviews({ rows, setRowsFn }, [{ id: ID, review: "approved" }]).rescan).toBe(true);
  });
});

describe("Upload lists only exports whose source is still approved", () => {
  it("keeps an approved source's export and knows its pair file", async () => {
    const found = await discoverExportedItems(await workspace(), { sourcePairs: sourcePairsOf });
    expect(found.items).toHaveLength(1);
    expect(found.items[0].source).toEqual({ id: ID, metaPath: META });
  });

  it("hides an export whose source item is declined, and counts it", async () => {
    const found = await discoverExportedItems(await workspace("declined"), { sourcePairs: sourcePairsOf });
    expect(found.items).toHaveLength(0);
    expect(found.audit.declinedSources).toBe(1);
  });

  it("still lists an export whose pair file is not under this folder (an export folder picked alone)", async () => {
    const root = await workspace("declined");
    const exportOnly = (root.children.get("icons") as FakeDir).children.get("cat") as FakeDir;
    const found = await discoverExportedItems(exportOnly.children.get("export") as FakeDir, { sourcePairs: sourcePairsOf });
    expect(found.items).toHaveLength(1);
    expect(found.items[0].source ?? null).toBeNull();
  });
});

describe("Remove in Upload", () => {
  async function items(root: FakeDir): Promise<ExportedItem[]> {
    return (await discoverExportedItems(root, { sourcePairs: sourcePairsOf })).items;
  }

  it("declines the export's source item in Generate SVG; Undo approves it again", async () => {
    const root = await workspace();
    remember(STOCK_UPLOAD_HANDLE_KEY, root);
    const s = sink();
    const list = await items(root);
    expect(await removeStockItems({ items: list, uploading: false, say: s.say, hist: s.hist }, [ID])).toBe(true);
    expect(await reviewOf(root)).toBe("declined");
    expect(await items(root)).toHaveLength(0);
    expect(s.pushed[0]).toMatchObject({ type: "svgReview" });
    expect(s.said.at(-1)?.msg).toContain("SVG to upload");
    await applyEntry(s.pushed[0], s.pushed[0].before);
    expect(await reviewOf(root)).toBe("approved");
  });

  it("refuses while an upload runs, and for an export without a pair file", async () => {
    const root = await workspace();
    remember(STOCK_UPLOAD_HANDLE_KEY, root);
    const s = sink();
    const list = await items(root);
    expect(await removeStockItems({ items: list, uploading: true, say: s.say, hist: s.hist }, [ID])).toBe(false);
    const orphan = list.map((it) => ({ ...it, source: null }));
    expect(await removeStockItems({ items: orphan, uploading: false, say: s.say, hist: s.hist }, [ID])).toBe(false);
    expect(s.pushed).toHaveLength(0);
    expect(await reviewOf(root)).toBe("approved");
  });

  it("the list drops an item whose source was declined and unchecks it", async () => {
    const list = await items(await workspace());
    patchStockUpload({ checked: [ID], activeId: ID, anchorId: null });
    let kept: ExportedItem[] = list;
    const out = reactToStockReviews({ items: list, setItems: (next) => { kept = next; } }, [{ id: ID, review: "declined" }]);
    expect(kept).toHaveLength(0);
    expect(out.rescan).toBe(false);
    expect(getAppState().stockUpload.checked).toEqual([]);
    expect(reactToStockReviews({ items: [], setItems: () => undefined }, [{ id: ID, review: "approved" }]).rescan).toBe(true);
  });
});

describe("wired into both tabs", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("rows have Remove and the bulk bars Remove selected", () => {
    expect(src("src/upload/UploadRow.tsx")).toContain("upload-remove-${id}");
    expect(src("src/upload/UploadBulkBar.tsx")).toContain('data-testid="upload-remove-selected"');
    expect(src("src/stockupload/StockUploadRow.tsx")).toContain("stock-remove-${item.id}");
    expect(src("src/stockupload/StockUploadBulkBar.tsx")).toContain('data-testid="stock-remove-selected"');
  });
  it("both panels follow written decisions and Upload's scan looks up the source pairs", () => {
    expect(src("src/upload/actions.ts")).toContain("useUploadReviewFollower(");
    expect(src("src/stockupload/useStockUpload.ts")).toContain("useStockReviewFollower(");
    expect(src("src/stockupload/scan.ts")).toContain("sourcePairs: sourcePairsOf");
  });
});
