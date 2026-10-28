import { describe, expect, it } from "vitest";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { ADOBE_STOCK_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
import { loadStockHistory, resetStockHistory } from "../src/stockupload/historystore";
import { markUploadInFlight, recoverInterruptedUploads, resetUploadJournal } from "../src/stockupload/journal";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { getRowBadgeState, resetRowBadges } from "../src/upload/rowbadgestore";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function addExported(root: FakeDir, id: string, dir: string, stem: string, formats: { jpg?: boolean; svg?: boolean; eps?: boolean }) {
  const exportDir = `${dir}/export`;
  const rec = newExportRecord({
    pair: { id, base: stem, suffix: "", dir },
    source: { svgPath: `${dir}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: Boolean(formats.eps),
    now: "2026-10-27T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  rec.outputs = {
    svg: formats.svg ? { path: `${exportDir}/${stem}.svg`, bytes: 12, hash: "sha256:s" } : null,
    jpg: formats.jpg ? { path: `${exportDir}/${stem}.jpg`, bytes: 14, hash: "sha256:j" } : null,
    eps: formats.eps ? { path: `${exportDir}/${stem}.eps`, bytes: 16, hash: "sha256:e" } : null,
  };
  let cur = root;
  for (const seg of exportDir.split("/")) {
    const next = (cur.children.get(seg) as FakeDir | undefined) ?? new FakeDir(seg);
    cur.children.set(seg, next);
    cur = next;
  }
  const json = serializeExportRecord(rec);
  cur.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  if (formats.svg) cur.children.set(`${stem}.svg`, new FakeFile(`${stem}.svg`, 12, 1000, "<svg/>"));
  if (formats.jpg) cur.children.set(`${stem}.jpg`, new FakeFile(`${stem}.jpg`, 14, 1000, "jpeg-bytes-123"));
  if (formats.eps) cur.children.set(`${stem}.eps`, new FakeFile(`${stem}.eps`, 16, 1000, "%!PS-Adobe-3.0\n"));
}

const SECOND_SITE: StockFtpPreset = {
  ...SHUTTERSTOCK_PRESET,
  id: "dreamstime",
  name: "Dreamstime",
  template: "custom",
  host: "ftp.dreamstime.test",
};

describe("stock upload planner, batch runner and crash journal", () => {
  it("plans multi-site and multi-format tasks with same-stem filenames and reports missing formats", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true }); // no eps!
    const found = await discoverExportedItems(root);

    const plan = buildStockUploadPlan({
      items: found.items,
      checkedIds: ["icon-1", "icon-2"],
      presets: [SHUTTERSTOCK_PRESET, SECOND_SITE],
      checkedTargets: ["shutterstock", "dreamstime"],
      formats: { raster: true, svg: false, eps: true, zip: true },
    });

    expect(plan.preflightErrors).toEqual([]);
    // icon-1 has jpg + eps + zip = 3 files * 2 sites = 6; icon-2 has jpg + zip = 2 files * 2 sites = 4 -> 10 tasks
    expect(plan.tasks).toHaveLength(10);
    expect(plan.tasks.filter((t) => t.itemId === "icon-1" && t.targetId === "shutterstock").map((t) => t.fileName))
      .toEqual(["star_01.jpg", "star_01.eps", "star_01.zip"]);
    expect(plan.skippedMissing).toEqual([{ itemId: "icon-2", stem: "moon_02", format: "eps" }]);
  });

  it("isolates per-file failures, supports mid-run cancellation, and updates local history", async () => {
    localStorage.clear();
    resetStockHistory();
    resetUploadJournal();

    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);

    const plan = buildStockUploadPlan({
      items: found.items,
      checkedIds: ["icon-1", "icon-2"],
      presets: [SHUTTERSTOCK_PRESET],
      checkedTargets: ["shutterstock"],
      formats: { raster: true, svg: false, eps: true, zip: false },
    });

    const sent: string[] = [];
    const controller = new AbortController();
    const progressSteps: number[] = [];

    const summary = await executeStockUploadBatch(plan, {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: controller.signal,
      loadCreds: async () => ({ username: "u", password: "p" }),
      onProgress: (p) => progressSteps.push(p.done),
      uploadFn: async (inp) => {
        sent.push(inp.fileName);
        if (inp.fileName === "star_01.eps") {
          return { ok: false, code: "ftp", reason: "disk quota", serverCertSha256: null };
        }
        if (inp.fileName === "moon_02.jpg") controller.abort();
        return { ok: true, bytes: inp.bytes.byteLength };
      },
      closeSessionFn: async () => undefined,
    });

    // star_01.jpg succeeded, star_01.eps failed -> partial; moon_02.jpg succeeded then aborted before moon_02.eps
    expect(sent).toEqual(["star_01.jpg", "star_01.eps", "moon_02.jpg"]);
    expect(summary.uploadedFiles).toBe(2);
    expect(summary.failedFiles).toBe(1);
    expect(summary.cancelled).toBe(true);
    expect(progressSteps).toEqual([1, 2, 3]);

    const hist = loadStockHistory();
    expect(hist["icon-1"].shutterstock.status).toBe("partial");
    expect(hist["icon-1"].shutterstock.formats).toEqual(["raster"]);
  });

  it("converts open crash-journal entries into interrupted status once on boot without re-uploading", () => {
    localStorage.clear();
    resetStockHistory();
    resetUploadJournal();
    markUploadInFlight("icon-9", "shutterstock", "2026-10-27T11:00:00.000Z");

    const count = recoverInterruptedUploads();
    expect(count).toBe(1);
    expect(loadStockHistory()["icon-9"].shutterstock.status).toBe("interrupted");
    expect(recoverInterruptedUploads()).toBe(0);
  });

  it("emits Adobe Stock submission guideline warnings for ZIP archives, subfolders, and missing 5-49 keywords", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { svg: true, eps: true });
    const found = await discoverExportedItems(root);

    const plan = buildStockUploadPlan({
      items: found.items,
      checkedIds: ["icon-1"],
      presets: [{ ...ADOBE_STOCK_PRESET, remoteDir: "/nested" }],
      checkedTargets: ["adobe-stock"],
      formats: { raster: false, svg: true, eps: true, zip: true },
    });

    expect(plan.warnings.some((w) => w.includes("Adobe Stock") && w.includes("ZIP"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Adobe Stock") && w.includes("root '/'"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Adobe Stock") && w.includes("5–49 keywords"))).toBe(true);
  });

  it("automatically assigns each stock's unique named badge immediately as soon as a file is sent to that stock", async () => {
    localStorage.clear();
    resetStockHistory();
    resetUploadJournal();
    resetRowBadges();

    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { svg: true });
    addExported(root, "icon-2", "b", "moon_02", { svg: true });
    const found = await discoverExportedItems(root);

    const plan = buildStockUploadPlan({
      items: found.items,
      checkedIds: ["icon-1", "icon-2"],
      presets: [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET],
      checkedTargets: ["shutterstock", "adobe-stock"],
      formats: { raster: false, svg: true, eps: false, zip: false },
    });

    const snapshotsAfterProgress: Array<{ step: number; icon1Badges: string[]; icon2Badges: string[] }> = [];

    await executeStockUploadBatch(plan, {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "u", password: "p" }),
      onProgress: (p) => {
        const rb = getRowBadgeState();
        snapshotsAfterProgress.push({
          step: p.done,
          icon1Badges: [...(rb.assigned["icon-1"] ?? [])],
          icon2Badges: [...(rb.assigned["icon-2"] ?? [])],
        });
      },
      uploadFn: async (inp) => {
        // Fail moon_02 on Adobe Stock -> must NOT get Adobe Stock badge!
        if (inp.preset.id === "adobe-stock" && inp.fileName === "moon_02.svg") {
          return { ok: false, code: "ftp", reason: "rejected", serverCertSha256: null };
        }
        return { ok: true, bytes: inp.bytes.byteLength };
      },
      closeSessionFn: async () => undefined,
    });

    // Step 1: icon-1 sent to Shutterstock -> immediately has stock:shutterstock, icon-2 still has none!
    expect(snapshotsAfterProgress[0]).toEqual({
      step: 1,
      icon1Badges: ["stock:shutterstock"],
      icon2Badges: [],
    });
    // Step 2: icon-2 sent to Shutterstock -> both have stock:shutterstock; Adobe Stock still pending!
    expect(snapshotsAfterProgress[1]).toEqual({
      step: 2,
      icon1Badges: ["stock:shutterstock"],
      icon2Badges: ["stock:shutterstock"],
    });
    // Step 3: icon-1 sent to Adobe Stock -> icon-1 immediately gains stock:adobe-stock!
    expect(snapshotsAfterProgress[2]).toEqual({
      step: 3,
      icon1Badges: ["stock:shutterstock", "stock:adobe-stock"],
      icon2Badges: ["stock:shutterstock"],
    });
    // Step 4: icon-2 failed on Adobe Stock -> icon-2 keeps ONLY stock:shutterstock!
    expect(snapshotsAfterProgress[3]).toEqual({
      step: 4,
      icon1Badges: ["stock:shutterstock", "stock:adobe-stock"],
      icon2Badges: ["stock:shutterstock"],
    });
  });
});
