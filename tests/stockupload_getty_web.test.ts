// The Getty web target inside the batch runner: one icon per browser upload,
// JPEG first with an optional EPS, one shared batch name, one session close.

import { beforeEach, describe, expect, it } from "vitest";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";
import { GETTY_WEB_SUBMISSION_TYPE } from "../src/lib/stockupload/gettyweb";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { resetRowBadges } from "../src/upload/rowbadgestore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import type { GettyWebUploadInput } from "../src/lib/stockupload/gettywebclient";

function addExported(root: FakeDir, id: string, dir: string, stem: string, formats: { jpg: boolean; eps: boolean }): void {
  const exportDir = `${dir}/export`;
  const rec = newExportRecord({
    pair: { id, base: stem, suffix: "", dir },
    source: { svgPath: `${dir}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: formats.eps,
    now: "2026-10-27T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  rec.outputs = {
    svg: null,
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
  if (formats.jpg) cur.children.set(`${stem}.jpg`, new FakeFile(`${stem}.jpg`, 14, 1000, "jpeg-bytes-123"));
  if (formats.eps) cur.children.set(`${stem}.eps`, new FakeFile(`${stem}.eps`, 16, 1000, "%!PS-Adobe-3.0\n"));
}

function planFor(items: Awaited<ReturnType<typeof discoverExportedItems>>["items"], formats = { raster: true, svg: false, eps: true, zip: false }) {
  return buildStockUploadPlan({
    items, checkedIds: items.map((i) => i.id), presets: [GETTY_WEB_PRESET],
    checkedTargets: [GETTY_WEB_PRESET.id], formats,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetStockHistory();
  resetUploadJournal();
  resetRowBadges();
});

describe("Getty web upload in the batch runner", () => {
  it("sends one JPEG+EPS pair per icon into one shared batch and closes the session once", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    const plan = planFor(found.items);

    const sent: GettyWebUploadInput[] = [];
    const closed: string[] = [];
    const summary = await executeStockUploadBatch(plan, {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async (input) => {
        sent.push(input);
        return { ok: true, batchId: "68445204", accepted: input.files.map((f) => f.name) };
      },
      closeGettyWebFn: async (_url, sessionKey) => { closed.push(sessionKey); },
    });

    expect(summary).toMatchObject({ uploadedFiles: 4, failedFiles: 0, cancelled: false });
    expect(sent).toHaveLength(2);
    expect(sent[0].files.map((f) => f.name)).toEqual(["star_01.jpg", "star_01.eps"]);
    expect(sent[1].files.map((f) => f.name)).toEqual(["moon_02.jpg", "moon_02.eps"]);
    expect(sent.every((input) => input.submissionType === GETTY_WEB_SUBMISSION_TYPE)).toBe(true);
    expect(sent.every((input) => /^IconSplitter \d{4}-\d{2}-\d{2} \(2 icons\)$/.test(input.batchName))).toBe(true);
    expect(new Set(sent.map((input) => input.sessionKey)).size).toBe(1);
    expect(closed).toEqual([sent[0].sessionKey]);
    expect(sent[0].creds.password).toBe("GettyPass!42");
  });

  it("fails a PNG-only plan before any browser upload is attempted", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: false, eps: true });
    const found = await discoverExportedItems(root);
    const plan = planFor(found.items, { raster: true, svg: false, eps: true, zip: false });
    let calls = 0;
    const summary = await executeStockUploadBatch(plan, {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [] }; },
      closeGettyWebFn: async () => undefined,
    });
    expect(calls).toBe(0);
    expect(summary.failedFiles).toBeGreaterThan(0);
    expect(summary.lastError).toContain("JPEG");
  });

  it("refuses an icon whose JPEG is missing on disk instead of uploading half a pair", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    let calls = 0;
    const summary = await executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [] }; },
      closeGettyWebFn: async () => undefined,
    });
    expect(calls).toBe(0);
    expect(summary.lastError).toContain("missing on disk");
  });

  it("reports missing credentials without contacting the helper", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    let calls = 0;
    const summary = await executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => null,
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [] }; },
    });
    expect(calls).toBe(0);
    expect(summary.failedFiles).toBe(1);
    expect(summary.lastError).toContain("No saved credentials");
  });
});
