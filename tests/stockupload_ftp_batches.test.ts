// Shutterstock and Adobe Stock take one file per request, and the site sorts the
// folder by name — the number in front of every file name is the plan the user
// made (0001, 0002, 0003 …). The run must walk the icons in exactly that number
// order, whatever folder each one sits in, and send the real names: a site keeps
// the file it is given, so a number this run invents is a file the user did not plan.

import { describe, expect, it } from "vitest";
import {
  compareIconNames, leadingNumber, numericIconOrder,
} from "../src/lib/stockupload/fileorder";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { ADOBE_STOCK_PRESET, SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import type { StockFtpPreset } from "../src/lib/stockupload/types";
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

/** Folder order is deliberately the reverse of the numbers: the plan is the name. */
const NUMBERED = [
  { stem: "0154-icon-waving-flag_5_03", dir: "a-flags" },
  { stem: "0023-icon-steering-wheel_7_02", dir: "b-travel" },
  { stem: "0024-icon-wallet_4_01", dir: "c-money" },
];

const NUMBERED_SENT = [
  "0023-icon-steering-wheel_7_02.jpg", "0023-icon-steering-wheel_7_02.eps",
  "0024-icon-wallet_4_01.jpg", "0024-icon-wallet_4_01.eps",
  "0154-icon-waving-flag_5_03.jpg", "0154-icon-waving-flag_5_03.eps",
];

/** Uploads the icons to one preset and returns what the helper was handed. */
async function runSite(
  preset: StockFtpPreset,
  config: { cap?: number; random?: boolean; icons?: readonly { stem: string; dir: string }[] } = {},
): Promise<{ sent: string[]; labels: string[]; uploadedFiles: number }> {
  localStorage.clear();
  resetStockHistory();
  resetUploadJournal();
  resetRowBadges();
  const root = new FakeDir("ws");
  const icons = config.icons ?? NUMBERED;
  icons.forEach((icon, index) => addExported(root, `icon-${index + 1}`, icon.dir, icon.stem));
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

describe("the number in front of a name is the upload order", () => {
  it("reads the number a name starts with, and null when there is none", () => {
    expect(leadingNumber("0012-icon-snowflake_2_01.jpg")).toBe(12);
    expect(leadingNumber("sub/dir/0154-star.eps")).toBe(154);
    expect(leadingNumber("icon-snowflake_2_01.jpg")).toBeNull();
  });

  it("orders by that number first, then naturally (icon_2 before icon_10)", () => {
    expect(compareIconNames("0154-a.jpg", "0023-b.jpg")).toBeGreaterThan(0);
    expect(compareIconNames("icon_2.jpg", "icon_10.jpg")).toBeLessThan(0);
    // A numbered name outranks an unnumbered one; the rest keep alphabetical order.
    expect(numericIconOrder(["star_01.jpg", "0023-b.jpg", "cloud_02.jpg"])).toEqual([1, 2, 0]);
  });
});

describe("Shutterstock and Adobe Stock upload in the plan's number order", () => {
  it("walks the icons 0023 → 0024 → 0154, not the folder order discovery gives", async () => {
    const { sent, uploadedFiles } = await runSite(SHUTTERSTOCK_PRESET);
    expect(sent).toEqual(NUMBERED_SENT);
    expect(uploadedFiles).toBe(6);
  });

  it("keeps a JPEG and its EPS together under the icon's own number", async () => {
    const { sent } = await runSite(SHUTTERSTOCK_PRESET, { cap: 2 });
    for (const base of ["0023-icon-steering-wheel_7_02", "0024-icon-wallet_4_01", "0154-icon-waving-flag_5_03"]) {
      expect(sent.filter((name) => name.startsWith(base))).toEqual([`${base}.jpg`, `${base}.eps`]);
    }
  });

  it("names the batch in the panel's progress line, 100 icons at a time", async () => {
    const { labels } = await runSite(SHUTTERSTOCK_PRESET, { cap: 2 });
    expect(labels[0]).toBe("Shutterstock batch 1/2 · 0023-icon-steering-wheel_7_02.jpg");
    expect(labels[3]).toBe("Shutterstock batch 1/2 · 0024-icon-wallet_4_01.eps");
    expect(labels[4]).toBe("Shutterstock batch 2/2 · 0154-icon-waving-flag_5_03.jpg");
  });

  it("sends the real names and the same order with Random batches on", async () => {
    const off = await runSite(SHUTTERSTOCK_PRESET);
    const on = await runSite(SHUTTERSTOCK_PRESET, { random: true });
    // A site keeps what it is handed: no rank is invented in front of the plan's number.
    expect(on.sent).toEqual(NUMBERED_SENT);
    expect(on.sent).toEqual(off.sent);
  });

  it("falls back to name order for exports that carry no number", async () => {
    const icons = ["star_01", "moon_02", "sun_03", "cloud_04"].map((stem) => ({ stem, dir: `d-${stem}` }));
    const { sent } = await runSite(SHUTTERSTOCK_PRESET, { icons });
    expect(sent).toEqual([
      "cloud_04.jpg", "cloud_04.eps", "moon_02.jpg", "moon_02.eps",
      "star_01.jpg", "star_01.eps", "sun_03.jpg", "sun_03.eps",
    ]);
  });

  it("does the same for Adobe Stock's SFTP drop", async () => {
    const { sent, labels } = await runSite(ADOBE_STOCK_PRESET, { cap: 2 });
    expect(sent).toEqual(NUMBERED_SENT);
    expect(labels[0]).toBe("Adobe Stock batch 1/2 · 0023-icon-steering-wheel_7_02.jpg");
  });
});
