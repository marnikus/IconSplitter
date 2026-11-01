// Shutterstock and Adobe Stock take files one at a time, but the run still walks
// the selection **100 icons per batch**: each batch is drawn at random from what
// is left, mixed inside itself, and every icon is numbered **in the order it is
// sent** — 0001 travels first, then 0002, and the next batch counts on — so the
// site receives exactly 0001-…, 0002-…, 0003-… in that sequence. The row, the log
// and the history still speak the real name.

import { describe, expect, it } from "vitest";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { ADOBE_STOCK_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
import { realNameOf } from "../src/lib/stockupload/shufflenames";
import { resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { resetRowBadges } from "../src/upload/rowbadgestore";
import { FakeDir, FakeFile } from "./helpers/fakefs";

function addExported(root: FakeDir, id: string, dir: string, stem: string): void {
  const exportDir = `${dir}/export`;
  const rec = newExportRecord({
    pair: { id, base: stem, suffix: "", dir },
    source: { svgPath: `${dir}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: true,
    now: "2026-10-27T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  rec.outputs = {
    svg: null,
    jpg: { path: `${exportDir}/${stem}.jpg`, bytes: 14, hash: "sha256:j" },
    eps: { path: `${exportDir}/${stem}.eps`, bytes: 16, hash: "sha256:e" },
  };
  let cur = root;
  for (const seg of exportDir.split("/")) {
    const next = (cur.children.get(seg) as FakeDir | undefined) ?? new FakeDir(seg);
    cur.children.set(seg, next);
    cur = next;
  }
  const json = serializeExportRecord(rec);
  cur.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  cur.children.set(`${stem}.jpg`, new FakeFile(`${stem}.jpg`, 14, 1000, "jpeg-bytes-123"));
  cur.children.set(`${stem}.eps`, new FakeFile(`${stem}.eps`, 16, 1000, "%%!PS-Adobe-3.0\n"));
}

const STEMS = ["star_01", "moon_02", "sun_03", "cloud_04"];

/** Uploads the four icons to one preset and returns what the helper was handed. */
async function runSite(
  preset: StockFtpPreset,
  config: { cap?: number; random?: boolean } = {},
): Promise<{ sent: string[]; labels: string[]; uploadedFiles: number }> {
  localStorage.clear();
  resetStockHistory();
  resetUploadJournal();
  resetRowBadges();
  const root = new FakeDir("ws");
  STEMS.forEach((stem, index) => addExported(root, `icon-${index + 1}`, `d${index}`, stem));
  const found = await discoverExportedItems(root);
  const plan = buildStockUploadPlan({
    items: found.items,
    checkedIds: found.items.map((item) => item.id),
    presets: [preset],
    checkedTargets: [preset.id],
    formats: { raster: true, svg: false, eps: true, zip: false },
  });
  const sent: string[] = [];
  const labels: string[] = [];
  const summary = await executeStockUploadBatch(plan, {
    root,
    bridgeUrl: "http://127.0.0.1:47391",
    signal: new AbortController().signal,
    loadCreds: async () => ({ username: "u", password: "p" }),
    onProgress: (step) => labels.push(step.label),
    ftpMaxIcons: config.cap,
    gettyWebRandomBatches: config.random,
    gettyWebRandomFn: () => 0,
    uploadFn: async (input) => {
      sent.push(input.fileName);
      return { ok: true, bytes: input.bytes.byteLength };
    },
    closeSessionFn: async () => undefined,
  });
  return { sent, labels, uploadedFiles: summary.uploadedFiles };
}

describe("Shutterstock and Adobe Stock upload in random 100-icon batches", () => {
  it("leaves the order and the names exactly as they are with Random batches off", async () => {
    const { sent, uploadedFiles } = await runSite(SHUTTERSTOCK_PRESET);
    expect(sent).toEqual([
      "star_01.jpg", "star_01.eps", "moon_02.jpg", "moon_02.eps",
      "sun_03.jpg", "sun_03.eps", "cloud_04.jpg", "cloud_04.eps",
    ]);
    expect(uploadedFiles).toBe(8);
  });

  it("names the batch in the panel's progress line, 100 icons at a time", async () => {
    const { labels } = await runSite(SHUTTERSTOCK_PRESET, { cap: 2 });
    // Two icons per batch, in the list order: nothing is drawn with the box off.
    expect(labels[0]).toBe("Shutterstock batch 1/2 · star_01.jpg");
    expect(labels[3]).toBe("Shutterstock batch 1/2 · moon_02.eps");
    expect(labels[4]).toBe("Shutterstock batch 2/2 · sun_03.jpg");
  });

  it("draws the next 100 at random and mixes them inside the batch", async () => {
    const { sent } = await runSite(SHUTTERSTOCK_PRESET, { cap: 2, random: true });
    // Draw [moon, sun, cloud, star], two per batch, each batch mixed again.
    expect(sent.map(realNameOf)).toEqual([
      "sun_03.jpg", "sun_03.eps", "moon_02.jpg", "moon_02.eps",
      "star_01.jpg", "star_01.eps", "cloud_04.jpg", "cloud_04.eps",
    ]);
  });

  it("sends the icons in the exact order of their numbers: 0001 first, then 0002…", async () => {
    const { sent } = await runSite(SHUTTERSTOCK_PRESET, { random: true });
    // The draw mixed the batch to sun, cloud, star, moon — and the number on the
    // wire now IS that order, both sizes of one picture sharing one number.
    expect(sent).toEqual([
      "0001-sun_03.jpg", "0001-sun_03.eps", "0002-cloud_04.jpg", "0002-cloud_04.eps",
      "0003-star_01.jpg", "0003-star_01.eps", "0004-moon_02.jpg", "0004-moon_02.eps",
    ]);
  });

  it("counts on through the next batch instead of starting the numbers over", async () => {
    const { sent } = await runSite(SHUTTERSTOCK_PRESET, { cap: 2, random: true });
    expect(sent).toEqual([
      "0001-sun_03.jpg", "0001-sun_03.eps", "0002-moon_02.jpg", "0002-moon_02.eps",
      "0003-star_01.jpg", "0003-star_01.eps", "0004-cloud_04.jpg", "0004-cloud_04.eps",
    ]);
  });

  it("does the same for Adobe Stock's SFTP drop", async () => {
    const { sent, labels } = await runSite(ADOBE_STOCK_PRESET, { cap: 2, random: true });
    expect(sent.map(realNameOf)).toEqual([
      "sun_03.jpg", "sun_03.eps", "moon_02.jpg", "moon_02.eps",
      "star_01.jpg", "star_01.eps", "cloud_04.jpg", "cloud_04.eps",
    ]);
    expect(sent[0]).toBe("0001-sun_03.jpg");
    expect(labels[0]).toContain("Adobe Stock batch 1/2");
  });
});
