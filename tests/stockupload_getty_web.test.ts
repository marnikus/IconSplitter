// The Getty web target inside the batch runner: every selected icon in one
// browser upload, JPEG first with an optional EPS, one shared batch, one close.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { GETTY_WEB_PRESET } from "../src/lib/stockupload/presets";
import { GETTY_WEB_SUBMISSION_TYPE } from "../src/lib/stockupload/gettyweb";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { getStockHistory, resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { progressLabel, settledFiles, watchGettyProgress } from "../src/stockupload/gettywebtransfer";
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

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  resetStockHistory();
  resetUploadJournal();
  resetRowBadges();
});

describe("Getty web upload in the batch runner", () => {
  it("sends every selected pair in one upload call, then closes the session once", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    const plan = planFor(found.items);

    const sent: GettyWebUploadInput[] = [];
    const closed: string[] = [];
    const finished: string[] = [];
    const summary = await executeStockUploadBatch(plan, {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async (input) => {
        sent.push(input);
        return {
          ok: true,
          batchId: "68445204",
          accepted: input.icons.flatMap((icon) => icon.files.map((f) => f.name)),
          completed: false,
          completion: null,
          metadata: [],
        };
      },
      finishGettyWebFn: async (input) => {
        finished.push(input.sessionKey);
        return {
          ok: true, batchId: "68445204", accepted: [], completed: true,
          completion: { clicked: true, label: "SUBMIT", confirmed: true }, metadata: [],
        };
      },
      closeGettyWebFn: async (_url, sessionKey) => { closed.push(sessionKey); },
    });

    expect(summary).toMatchObject({ uploadedFiles: 4, failedFiles: 0, cancelled: false });
    // All pairs at once: one request, not one per icon.
    expect(sent).toHaveLength(1);
    expect(sent[0].icons.map((icon) => icon.files.map((f) => f.name))).toEqual([
      ["star_01.jpg", "star_01.eps"], ["moon_02.jpg", "moon_02.eps"],
    ]);
    expect(sent[0].submissionType).toBe(GETTY_WEB_SUBMISSION_TYPE);
    expect(sent[0].batchName).toMatch(/^IconSplitter \d{4}-\d{2}-\d{2} \(2 icons\)$/);
    // One batch for all icons: nobody submits per icon, the run finishes once.
    expect(sent[0].complete).toBe(false);
    expect(finished).toEqual([sent[0].sessionKey]);
    expect(summary.lastError).toBeNull();
    expect(closed).toEqual([sent[0].sessionKey]);
    expect(sent[0].creds.password).toBe("GettyPass!42");
  });

  it("shows Getty's own per-file progress while the one upload is in flight", async () => {
    vi.useFakeTimers();
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    const labels: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const run = executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      onProgress: (step) => labels.push(step.label),
      gettyWebUploadFn: async (input) => {
        await gate;
        return {
          ok: true, batchId: "68565609",
          accepted: input.icons.flatMap((icon) => icon.files.map((f) => f.name)),
          failed: [], completed: false, completion: null, metadata: [],
        };
      },
      gettyWebProgressFn: async () => ({
        phase: "uploading", total: 4, uploaded: 2, failed: 0, listed: 3, reloads: 0,
      }),
      finishGettyWebFn: async () => ({
        ok: true, batchId: "68565609", accepted: [], completed: true,
        completion: { clicked: true, label: "SUBMIT", confirmed: true }, metadata: [],
      }),
      closeGettyWebFn: async () => undefined,
    });
    await vi.advanceTimersByTimeAsync(2100);
    release!();
    await run;
    // While the bytes move the panel counts what Getty already has.
    expect(labels.some((line) => line.includes("Getty Images (web upload): 2 of 4 file(s) uploaded"))).toBe(true);
  });

  it("says so when Getty's page had to be reloaded to get moving", () => {
    const base = { phase: "uploading", total: 14, uploaded: 5, failed: 2, listed: 14 };
    expect(progressLabel({ ...base, reloads: 0 }, "Getty Images (web upload)"))
      .toBe("Getty Images (web upload): 5 of 14 file(s) uploaded, 2 failed");
    expect(progressLabel({ ...base, reloads: 1 }, "Getty Images (web upload)"))
      .toContain("page reloaded");
  });

  it("verifies the bar against the cards turning Ready to submit", async () => {
    vi.useFakeTimers();
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    const steps: Array<{ done: number; total: number; label: string }> = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let polls = 0;
    const run = executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      onProgress: (step) => steps.push({ ...step }),
      gettyWebUploadFn: async (input) => {
        await gate;
        return {
          ok: true, batchId: "68565609",
          accepted: input.icons.flatMap((icon) => icon.files.map((f) => f.name)),
          failed: [], completed: false, completion: null, metadata: [],
        };
      },
      // The helper has no session for the first polls (its 404), then reports the
      // metadata save: every file has arrived, and the cards turn ready one by one.
      gettyWebProgressFn: async () => {
        polls += 1;
        if (polls <= 2) return null;
        // The transfer is done; the cards turn "Ready to submit" one by one.
        return { phase: "metadata", total: 4, uploaded: 4, ready: polls >= 4 ? 2 : 1, failed: 0, listed: 4, reloads: 0 };
      },
      finishGettyWebFn: async () => ({
        ok: true, batchId: "68565609", accepted: [], completed: true,
        completion: { clicked: true, label: "SUBMIT", confirmed: true }, metadata: [],
      }),
      closeGettyWebFn: async () => undefined,
    });
    await vi.advanceTimersByTimeAsync(6000);
    release!();
    await run;
    // The bar keeps the files Getty already has (4), while the line verifies the
    // cards turning "Ready to submit" — 1 of 4, then 2 of 4.
    expect(steps.some((step) => step.done === 4 && step.label.includes("1 of 4 file(s) ready to submit"))).toBe(true);
    expect(steps.some((step) => step.done === 4 && step.label.includes("2 of 4 file(s) ready to submit"))).toBe(true);
    // And the misses before the helper's session did not stop the watching.
    expect(polls).toBeGreaterThan(3);
  });

  it("reads a live upload through a helper that answers nothing at first", async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    let calls = 0;
    const stop = watchGettyProgress(
      { bridgeUrl: "http://127.0.0.1:47391", sessionKey: "run-7", targetName: "Getty" },
      (progress) => seen.push(settledFiles(progress)),
      async () => {
        calls += 1;
        return calls <= 3 ? null : { phase: calls >= 5 ? "done" : "metadata", total: 4, uploaded: 2, ready: 2, failed: 1, listed: 4, reloads: 1 };
      },
    );
    await vi.advanceTimersByTimeAsync(4000);
    stop();
    // 404s are retried, and a settled reading ends the watch instead of polling on.
    // Two files Getty has (validated) plus one rejection are what counts as settled.
    expect(seen).toEqual([3, 3]);
    expect(calls).toBe(5);
  });

  it("stops watching when the run is over, with no timer left behind", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const stop = watchGettyProgress(
      { bridgeUrl: "http://127.0.0.1:47391", sessionKey: "run-7", targetName: "Getty" },
      () => undefined,
      async () => { calls += 1; return null; },
    );
    await vi.advanceTimersByTimeAsync(2500);
    stop();
    const after = calls;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(after);
    expect(after).toBeGreaterThan(1);
  });

  it("keeps the icons Getty listed and names the one it did not, before submitting once", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "moon_02", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    let finishes = 0;
    const summary = await executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      // Getty listed the first pair only: the second icon must not be called uploaded.
      gettyWebUploadFn: async () => ({
        ok: true, batchId: "68565609", accepted: ["star_01.jpg", "star_01.eps"],
        completed: false, completion: null, metadata: [],
      }),
      finishGettyWebFn: async () => {
        finishes += 1;
        return {
          ok: true, batchId: "68565609", accepted: [], completed: true,
          completion: { clicked: true, label: "SUBMIT", confirmed: true }, metadata: [],
        };
      },
      closeGettyWebFn: async () => undefined,
    });
    expect(summary).toMatchObject({ uploadedFiles: 2, failedFiles: 2 });
    expect(summary.lastError).toContain('"Ready to submit" icon for moon_02');
    expect(finishes).toBe(1);
  });

  it("never marks a pair Getty answered with Upload failed as uploaded", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: true });
    addExported(root, "icon-2", "b", "icon-megaphone_5_01", { jpg: true, eps: true });
    const found = await discoverExportedItems(root);
    const badges: string[] = [];
    const summary = await executeStockUploadBatch(planFor(found.items), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => ({
        ok: true, batchId: "2302569283", accepted: ["star_01.jpg", "star_01.eps"],
        failed: [{ name: "icon-megaphone_5_01.eps", id: "FSPID51446" }],
        completed: false, completion: null, metadata: [],
      }),
      finishGettyWebFn: async () => ({
        ok: false, code: "page",
        reason: 'Getty reports "Upload failed" for 1 of 2 contribution(s) — remove or re-upload them, then finish the batch',
      }),
      closeGettyWebFn: async () => undefined,
    });
    expect(summary).toMatchObject({ uploadedFiles: 2, failedFiles: 2 });
    expect(summary.lastError).toContain("Upload failed");
    badges.push(summary.lastError ?? "");
    // The rejected pair is named with Getty's own id, never called uploaded.
    expect(badges.join(" ")).toContain("FSPID51446");
    // And the row store agrees: that icon is failed, only the good one is uploaded.
    const history = getStockHistory();
    const statuses = Object.values(history).flatMap((byTarget) => Object.entries(byTarget));
    const byStatus = (want: string) => statuses.filter(([, entry]) => entry.status === want).length;
    expect(byStatus("uploaded")).toBe(1);
    expect(byStatus("failed")).toBe(1);
  });

  it("reports an un-submitted batch when the finish call completes nothing", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    const summary = await executeStockUploadBatch(planFor(found.items, { raster: true, svg: false, eps: false, zip: false }), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => ({
        ok: true, batchId: "68445204", accepted: ["star_01.jpg"],
        completed: false, completion: null, metadata: [],
      }),
      finishGettyWebFn: async () => ({
        ok: true, batchId: "68445204", accepted: [], completed: false, completion: null, metadata: [],
      }),
      closeGettyWebFn: async () => undefined,
    });
    expect(summary.failedFiles).toBe(0);
    expect(summary.uploadedFiles).toBe(1);
    expect(summary.lastError).toContain("not completed");
  });

  it("counts a batch that only needed its icons ready as finished, not unfinished", async () => {
    // The captured batch page offers no Complete control; every card showing
    // Getty's "Ready to submit" icon is the finished state, so the run ends at
    // info level instead of reporting an error on a job that was done.
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    const seen: string[] = [];
    const summary = await executeStockUploadBatch(planFor(found.items, { raster: true, svg: false, eps: false, zip: false }), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => ({
        ok: true, batchId: "68445204", accepted: ["star_01.jpg"], completed: false, ready: true,
        completion: null, metadata: [],
      }),
      finishGettyWebFn: async () => ({
        ok: true, batchId: "68445204", accepted: [], completed: false, ready: true, completion: null, metadata: [],
      }),
      closeGettyWebFn: async () => undefined,
      logFn: (spec) => seen.push(`${spec.action}:${spec.detail}:${spec.level}`),
    });
    expect(summary.uploadedFiles).toBe(1);
    expect(summary.failedFiles).toBe(0);
    // Nothing to complain about: the files are ready to submit.
    expect(summary.lastError).toBeNull();
    expect(seen.some((line) => line.startsWith("batch-ready:"))).toBe(true);
    expect(seen.some((line) => /run-finished:1 file\(s\) uploaded, 0 failed:info/.test(line))).toBe(true);
  });

  it("keeps the helper's own reason when the batch cannot be submitted", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    const summary = await executeStockUploadBatch(planFor(found.items, { raster: true, svg: false, eps: false, zip: false }), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => ({
        ok: true, batchId: "1", accepted: ["star_01.jpg"], completed: false, completion: null, metadata: [],
      }),
      finishGettyWebFn: async () => ({
        ok: false, code: "timeout",
        reason: "Getty lists 1 of 2 contribution(s) — not completing the batch",
      }),
      closeGettyWebFn: async () => undefined,
    });
    expect(summary.uploadedFiles).toBe(1);
    expect(summary.lastError).toContain("1 of 2 contribution(s)");
  });

  it("does not submit an empty batch when every icon failed", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01", { jpg: true, eps: false });
    const found = await discoverExportedItems(root);
    let finishes = 0;
    const summary = await executeStockUploadBatch(planFor(found.items, { raster: true, svg: false, eps: false, zip: false }), {
      root,
      bridgeUrl: "http://127.0.0.1:47391",
      signal: new AbortController().signal,
      loadCreds: async () => ({ username: "contributor@example.com", password: "GettyPass!42" }),
      gettyWebUploadFn: async () => ({ ok: false, code: "page", reason: "no uploader" }),
      finishGettyWebFn: async () => { finishes += 1; return { ok: true, batchId: null, accepted: [], completed: true, completion: null, metadata: [] }; },
      closeGettyWebFn: async () => undefined,
    });
    expect(summary.failedFiles).toBe(1);
    expect(finishes).toBe(0);
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
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [], completed: false, completion: null, metadata: [] }; },
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
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [], completed: false, completion: null, metadata: [] }; },
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
      gettyWebUploadFn: async () => { calls += 1; return { ok: true, batchId: null, accepted: [], completed: false, completion: null, metadata: [] }; },
    });
    expect(calls).toBe(0);
    expect(summary.failedFiles).toBe(1);
    expect(summary.lastError).toContain("No saved credentials");
  });
});
