// @vitest-environment node
// The stock upload tab's log trail: every file that went up, every reason one
// did not, the reload that unstuck Getty's page and the one summary line of the
// run — all through the shell's one log dock (no data field, so no metadata).

import { describe, expect, it } from "vitest";
import type { LogSpec } from "../src/lib/log";
import { newExportRecord, serializeExportRecord } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { discoverExportedItems } from "../src/lib/stockupload/discovery";
import { buildStockUploadPlan } from "../src/lib/stockupload/plan";
import { SHUTTERSTOCK_PRESET } from "../src/lib/stockupload/presets";
import { executeStockUploadBatch } from "../src/stockupload/runupload";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import {
  STOCKUPLOAD_FEATURE, STOCKUPLOAD_LOG_ACTIONS, batchReadySpec, batchSubmittedSpec, failedSpec, pageReloadedSpec,
  reloadNoteOf, runFinishedSpec, runStartedSpec, uploadedSpec,
} from "../src/stockupload/stockuploadlog";

describe("stock upload log vocabulary", () => {
  it("keeps one closed set of actions and never a data field", () => {
    expect([...STOCKUPLOAD_LOG_ACTIONS]).toEqual([
      "run-started", "uploaded", "failed", "page-reloaded", "batch-submitted", "batch-ready", "run-finished",
    ]);
    for (const spec of [
      runStartedSpec({ targets: ["Getty"], files: 4 }), uploadedSpec({ target: "Getty", file: "a.jpg" }),
      failedSpec({ target: "Getty", file: "a.jpg", reason: "no answer" }), pageReloadedSpec({ target: "Getty", reloads: 1 }),
      batchSubmittedSpec("Getty"), batchReadySpec({ target: "Getty", files: 4 }),
      runFinishedSpec({ uploaded: 1, failed: 1, cancelled: false, lastError: "x" }),
    ]) {
      expect(spec.feature).toBe(STOCKUPLOAD_FEATURE);
      expect(spec).not.toHaveProperty("data");
    }
  });

  it("names the file that went up at info level", () => {
    expect(uploadedSpec({ target: "Getty Images", file: "star_01.jpg" })).toMatchObject({
      level: "info", action: "uploaded", detail: "Getty Images · star_01.jpg uploaded",
    });
  });

  it("logs a failure as an error with its reason, never as a silent counter", () => {
    expect(failedSpec({ target: "Getty Images", file: "star_01.jpg", reason: "the batch page stopped answering" }))
      .toMatchObject({ level: "error", action: "failed", detail: "Getty Images · star_01.jpg failed — the batch page stopped answering" });
  });

  it("says the page was reloaded, since a stalled upload otherwise looks frozen", () => {
    expect(pageReloadedSpec({ target: "Getty Images", reloads: 2 })).toMatchObject({
      level: "warn", action: "page-reloaded", detail: "Getty Images: no progress for 30 s — page reloaded (2)",
    });
  });

  it("says a batch with no Complete button is ready to submit, at info level", () => {
    // A finished run must not read like a failure just because Getty had no
    // control left to click.
    expect(batchReadySpec({ target: "Getty Images", files: 14 })).toMatchObject({
      level: "info", action: "batch-ready",
      detail: "Getty Images: 14 file(s) ready to submit — Getty has no Complete button on this batch",
    });
  });

  it("only speaks when the helper's reload counter actually moved", () => {
    expect(reloadNoteOf(0, 0)).toBeNull();
    expect(reloadNoteOf(3, 2)).toBeNull();
    expect(reloadNoteOf(0, 1)).toBe(1);
  });

  it("ends the run with counts, and a cancel is a warning", () => {
    expect(runFinishedSpec({ uploaded: 3, failed: 0, cancelled: false, lastError: null }))
      .toMatchObject({ level: "info", action: "run-finished", detail: "3 file(s) uploaded, 0 failed" });
    expect(runFinishedSpec({ uploaded: 1, failed: 2, cancelled: false, lastError: "no credentials" }))
      .toMatchObject({ level: "error", action: "run-finished", detail: "1 file(s) uploaded, 2 failed — no credentials" });
    expect(runFinishedSpec({ uploaded: 1, failed: 0, cancelled: true, lastError: null }))
      .toMatchObject({ level: "warn", detail: "stopped after 1 file(s) uploaded, 0 failed" });
  });

  it("opens the run with what it is about to send", () => {
    expect(runStartedSpec({ targets: ["Getty Images"], files: 4 })).toMatchObject({
      level: "info", action: "run-started", detail: "upload started: 4 file(s) to Getty Images",
    });
  });
});

function addExported(root: FakeDir, id: string, dir: string, stem: string) {
  const exportDir = `${dir}/export`;
  const rec = newExportRecord({
    pair: { id, base: stem, suffix: "", dir },
    source: { svgPath: `${dir}/${stem}_AI.svg`, version: 1, approval: "approved", fingerprint: "10:1" },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective: DEFAULT_UPLOAD_SETTINGS, fingerprint: "f" },
    svgo: { enabled: true, version: "3", config: "default", beforeBytes: 10, afterBytes: 10, beforeHash: "0", afterHash: "0" },
    epsEnabled: false, now: "2026-10-27T10:00:00.000Z",
  });
  rec.stage = "committed";
  rec.status = "processed";
  rec.timestamps.committedAt = "2026-10-27T10:01:00.000Z";
  rec.outputs = { svg: null, jpg: { path: `${exportDir}/${stem}.jpg`, bytes: 14, hash: "sha256:j" }, eps: null };
  let cur = root;
  for (const seg of exportDir.split("/")) {
    const next = (cur.children.get(seg) as FakeDir | undefined) ?? new FakeDir(seg);
    cur.children.set(seg, next);
    cur = next;
  }
  const json = serializeExportRecord(rec);
  cur.children.set("export.json", new FakeFile("export.json", json.length, 1000, json));
  cur.children.set(`${stem}.jpg`, new FakeFile(`${stem}.jpg`, 14, 1000, "jpeg-bytes-123"));
}

describe("a stock upload run writes what happened into the log", () => {
  it("logs every uploaded file, every failure with its reason, and one summary line", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01");
    addExported(root, "icon-2", "b", "moon_02");
    const found = await discoverExportedItems(root);
    const plan = buildStockUploadPlan({
      items: found.items, checkedIds: ["icon-1", "icon-2"], presets: [SHUTTERSTOCK_PRESET],
      checkedTargets: ["shutterstock"], formats: { raster: true, svg: false, eps: false, zip: false },
    });
    const seen: LogSpec[] = [];
    await executeStockUploadBatch(plan, {
      root, bridgeUrl: "http://127.0.0.1:47391", signal: new AbortController().signal,
      loadCreds: async () => ({ username: "u", password: "p" }),
      logFn: (spec) => seen.push(spec),
      uploadFn: async (inp) => (inp.fileName === "moon_02.jpg"
        ? { ok: false, code: "ftp", reason: "disk quota", serverCertSha256: null }
        : { ok: true, bytes: inp.bytes.length }),
    });
    const actions = seen.map((spec) => spec.action);
    expect(actions).toEqual(["run-started", "uploaded", "failed", "run-finished"]);
    expect(seen[1].detail).toContain("star_01.jpg uploaded");
    expect(seen[2]).toMatchObject({ level: "error", detail: "Shutterstock · moon_02.jpg failed — disk quota" });
    expect(seen[3]).toMatchObject({ level: "error", detail: "1 file(s) uploaded, 1 failed — disk quota" });
  });

  it("logs missing credentials as the error they are, not just a quieter counter", async () => {
    const root = new FakeDir("ws");
    addExported(root, "icon-1", "a", "star_01");
    const found = await discoverExportedItems(root);
    const plan = buildStockUploadPlan({
      items: found.items, checkedIds: ["icon-1"], presets: [SHUTTERSTOCK_PRESET],
      checkedTargets: ["shutterstock"], formats: { raster: true, svg: false, eps: false, zip: false },
    });
    const seen: LogSpec[] = [];
    await executeStockUploadBatch(plan, {
      root, bridgeUrl: "", signal: new AbortController().signal, loadCreds: async () => null,
      logFn: (spec) => seen.push(spec),
    });
    expect(seen.some((spec) => spec.action === "failed" && /No saved credentials/.test(spec.detail ?? ""))).toBe(true);
  });
});
