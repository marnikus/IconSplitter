// stockupload_limit.test.ts — "Limit" on the Upload tab (2026-11-05). A limit
// above 0 draws that many icons AT RANDOM from the selection and uploads only
// them, in random 100-icon batches (Random batches is implied); the rest stay
// untouched for a later run. 200 selected + limit 150 → batches of 100 + 50,
// 50 left; limit 70 → one batch of 70, 130 left. 0 / empty = no limit.
import { beforeEach, describe, expect, it } from "vitest";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { limitStockUploadPlan, parseUploadLimit } from "../src/lib/stockupload/uploadlimit";
import { SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET } from "../src/lib/stockupload/presets";
import { realNameOf } from "../src/lib/stockupload/shufflenames";
import { loadStockPrefs, saveStockPrefs, DEFAULT_STOCK_PREFS, STOCK_PREFS_KEY } from "../src/stockupload/prefsstore";
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
    epsEnabled: true, now: "2026-10-27T10:00:00.000Z",
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

/** `n` exported icons and the plan that uploads all of them to the given sites. */
async function setup(n: number, presets = [SHUTTERSTOCK_PRESET]) {
  const root = new FakeDir("ws");
  for (let i = 1; i <= n; i += 1) addExported(root, `icon-${i}`, `d${i}`, `icon_${String(i).padStart(3, "0")}`);
  const found = await discoverExportedItems(root);
  const plan = buildStockUploadPlan({
    items: found.items, checkedIds: found.items.map((it) => it.id), presets,
    checkedTargets: presets.map((p) => p.id), formats: { raster: true, svg: false, eps: true, zip: false },
  });
  return { root, plan };
}

/** A fixed, non-trivial random source so the draw is repeatable in tests. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

beforeEach(() => { localStorage.clear(); resetStockHistory(); resetUploadJournal(); resetRowBadges(); });

describe("parseUploadLimit", () => {
  it("keeps a whole number above 0, and reads anything else as no limit", () => {
    expect([150, 70, 1, 0, -3, 2.7, "150", "", null, Number.NaN].map(parseUploadLimit)).toEqual([150, 70, 1, 0, 0, 2, 150, 0, 0, 0]);
  });

  it("is stored with the tab's preferences and validated on read", () => {
    saveStockPrefs({ ...DEFAULT_STOCK_PREFS, uploadLimit: 150 });
    expect(loadStockPrefs().uploadLimit).toBe(150);
    localStorage.setItem(STOCK_PREFS_KEY, JSON.stringify({ uploadLimit: "lots" }));
    expect(loadStockPrefs().uploadLimit).toBe(0);
  });
});

describe("limitStockUploadPlan", () => {
  it("keeps exactly `limit` icons, drawn at random, with all of their files", async () => {
    const { plan } = await setup(20);
    const limited = limitStockUploadPlan(plan, 15, seeded());
    expect(limited.selectedRows).toHaveLength(15);
    expect(limited.tasks).toHaveLength(30); // JPEG + EPS of each chosen icon
    expect(new Set(limited.tasks.map((t) => t.itemId)).size).toBe(15);
    expect(limited.limit).toEqual({ limit: 15, chosen: 15, total: 20 });
    expect(limited.totalBytes).toBe(15 * 30);
    // a random draw, not simply the first 15 of the list
    expect(limited.selectedRows.map((r) => r.id)).not.toEqual(plan.selectedRows.slice(0, 15).map((r) => r.id));
  });

  it("gives every site the same chosen icons", async () => {
    const { plan } = await setup(10, [SHUTTERSTOCK_PRESET, ADOBE_STOCK_PRESET]);
    const limited = limitStockUploadPlan(plan, 4, seeded());
    const per = (target: string) => new Set(limited.tasks.filter((t) => t.targetId === target).map((t) => t.itemId));
    expect([...per(SHUTTERSTOCK_PRESET.id)].sort()).toEqual([...per(ADOBE_STOCK_PRESET.id)].sort());
    expect(per(SHUTTERSTOCK_PRESET.id).size).toBe(4);
  });

  it("a limit at or above the selection keeps everything; 0 changes nothing", async () => {
    const { plan } = await setup(5);
    expect(limitStockUploadPlan(plan, 9, seeded()).tasks).toHaveLength(10);
    expect(limitStockUploadPlan(plan, 9, seeded()).limit).toEqual({ limit: 9, chosen: 5, total: 5 });
    expect(limitStockUploadPlan(plan, 0, seeded())).toBe(plan);
  });
});

describe("a limited run uploads only the drawn icons, in random batches", () => {
  async function run(n: number, limit: number, cap: number) {
    const { root, plan } = await setup(n);
    const limited = limitStockUploadPlan(plan, limit, seeded());
    const sent: string[] = [];
    const labels: string[] = [];
    const summary = await executeStockUploadBatch(limited, {
      root, bridgeUrl: "http://127.0.0.1:47391", signal: new AbortController().signal,
      loadCreds: async () => ({ username: "u", password: "p" }), onProgress: (step) => labels.push(step.label),
      ftpMaxIcons: cap, gettyWebRandomBatches: true, gettyWebRandomFn: () => 0,
      uploadFn: async (input) => { sent.push(input.fileName); return { ok: true, bytes: input.bytes.byteLength }; },
      closeSessionFn: async () => undefined,
    });
    return { limited, sent, labels, summary };
  }

  it("200 selected, limit 150 → a batch of 100, a batch of 50, and 50 left (scaled: 20 / 15 / cap 10)", async () => {
    const { limited, sent, labels, summary } = await run(20, 15, 10);
    expect(summary.uploadedFiles).toBe(30);
    expect(new Set(sent.map((f) => realNameOf(f).replace(/\.(jpg|eps)$/, ""))).size).toBe(15);
    expect(labels.some((l) => l.includes("batch 1/2"))).toBe(true);
    expect(labels.some((l) => l.includes("batch 2/2"))).toBe(true);
    const chosen = new Set(limited.selectedRows.map((r) => r.stem));
    expect(sent.every((f) => chosen.has(realNameOf(f).replace(/\.(jpg|eps)$/, "")))).toBe(true);
  });

  it("limit 70 of 200 → one batch of 70, 130 left (scaled: limit 7 of 20, cap 10)", async () => {
    const { sent, labels, summary } = await run(20, 7, 10);
    expect(summary.uploadedFiles).toBe(14);
    expect(labels.every((l) => !l.includes("batch 2/"))).toBe(true);
    expect(new Set(sent.map((f) => realNameOf(f).replace(/\.(jpg|eps)$/, ""))).size).toBe(7);
  });
});
