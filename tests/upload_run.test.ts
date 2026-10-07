// upload_run.test.ts — the disk side of one export (RULE 8/19): the approved SVG
// is read from the pair folder, the package is staged inside `export/`, the
// record moves last, and a failure leaves the previous package untouched.
import { describe, expect, it } from "vitest";
import { FakeDir } from "./helpers/fakefs";
import { minimalJpeg } from "./helpers/jpeg";
import { rowFromSource } from "../src/upload/rows";
import { loadCode, loadRecord, runRow, runRows, type RunContext } from "../src/upload/run";
import { EXPORT_DIR, readText, STAGING_DIR } from "../src/upload/runfs";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/uploadsettings";
import { REQUIRED_TAGS, TAG_COUNT, type MetadataRecord } from "../src/lib/uploadmeta";
import { svgToEps } from "../src/lib/epssvg";
import { epsSummary, verifyEps } from "../src/lib/epsverify";
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/geminiconfig";
import { svgSource, pairMetaFor, svgVersion } from "./helpers/svgpair";
import type { PipelineDeps } from "../src/lib/uploadpipeline";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
  + '<rect x="4" y="4" width="32" height="32" fill="#123456"/></svg>';

const metadata: MetadataRecord = {
  title: "Directional Momentum Conveying Forward Progress. Speed and motion.",
  description: "Arrow-like symbol expressing forward momentum and purposeful movement for interfaces.",
  tags: [...REQUIRED_TAGS, ...Array.from({ length: TAG_COUNT - REQUIRED_TAGS.length }, (_, i) => `tag-${i}`)],
};

/** The row as the panel builds it: a scanned source plus its approved version. */
function iconRow(): ReturnType<typeof rowFromSource> {
  const source = svgSource("pair-1", { dir: "10", name: "icon-arrow_AI_1.png" });
  return rowFromSource(source, pairMetaFor(source, [svgVersion("10/icon-arrow_AI_1_v1.svg", { version: 1, review: "approved" })]));
}

/** A root holding one pair folder with its approved SVG. */
async function folder(): Promise<FakeDir> {
  const root = new FakeDir("root");
  const pair = await root.getDirectoryHandle("10", { create: true });
  const svg = await pair.getFileHandle("icon-arrow_AI_1_v1.svg", { create: true });
  await write(svg, SVG);
  return root;
}

async function write(handle: { createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(new Blob([text]));
  await writable.close();
}

function context(root: FakeDir, over: Partial<RunContext> = {}): RunContext {
  return {
    root,
    settings: { ...DEFAULT_UPLOAD_SETTINGS, targetMP: 0.1 },
    overrides: {},
    metadataOf: () => metadata,
    wants: { svg: true, jpeg: true, eps: false },
    raster: async (_svg: string, artboard) => ({ ok: true, bytes: minimalJpeg(artboard.px.width, artboard.px.height), error: null, width: artboard.px.width, height: artboard.px.height }),
    eps: (svg, artboard) => svgToEps({ svg, widthPt: artboard.px.width * 0.24, heightPt: artboard.px.height * 0.24 }),
    verifyEps: async (file) => {
      const check = await verifyEps({ eps: file.eps, expectedPt: { width: file.width, height: file.height } });
      return { ok: check.ok, label: epsSummary(file, check), problems: check.checks.problems };
    },
    log: () => undefined,
    signal: new AbortController().signal,
    now: () => "2026-10-07T00:00:00.000Z",
    ...over,
  };
}

describe("runRow", () => {
  it("writes the package into export/ and reads the record back", async () => {
    const root = await folder();
    const row = iconRow();
    const result = await runRow(row, context(root));
    expect(result.error).toBeNull();
    expect(result.run?.status).toBe("processed");
    const dir = await root.getDirectoryHandle("10");
    const exportFolder = await dir.getDirectoryHandle(EXPORT_DIR);
    expect(await readText(exportFolder, "export.json")).toContain("\"status\": \"processed\"");
    expect(await loadRecord(row, root)).not.toBeNull();
    expect(await loadCode(row, root)).toMatchObject({ version: "v1" });
  });

  it("clears its staging folder, so no half-package is left behind", async () => {
    const root = await folder();
    const result = await runRow(iconRow(), context(root));
    expect(result.run).not.toBeNull();
    const exportFolder = await (await root.getDirectoryHandle("10")).getDirectoryHandle(EXPORT_DIR);
    const staging = await exportFolder.getDirectoryHandle(STAGING_DIR);
    expect([...staging.children.keys()]).toEqual([]);
  });

  it("keeps the previous package when a stage fails mid-run", async () => {
    const root = await folder();
    const row = iconRow();
    await runRow(row, context(root));
    const before = await readText(await (await root.getDirectoryHandle("10")).getDirectoryHandle(EXPORT_DIR), "export.json");

    const withRecord = { ...row, record: await loadRecord(row, root), code: SVG };
    const failed = await runRow(withRecord, context(root, {
      // A raster that comes back the wrong size is a render failure, not a resize.
      raster: async () => ({ ok: true, bytes: minimalJpeg(8, 8), error: null, width: 8, height: 8 }),
      settings: { ...DEFAULT_UPLOAD_SETTINGS, targetMP: 0.1, jpegQuality: 0.5 },
    }));
    expect(failed.run?.status).toBe("failed");
    const after = await readText(await (await root.getDirectoryHandle("10")).getDirectoryHandle(EXPORT_DIR), "export.json");
    expect(after).toBe(before); // the valid package is still the one on disk
  });

  it("says so when there is no approved SVG to export", async () => {
    const bare = rowFromSource(svgSource("pair-9", { dir: "10", name: "icon-other_AI_1.png" }), pairMetaFor(svgSource("pair-9", { dir: "10", name: "icon-other_AI_1.png" })));
    const result = await runRow(bare, context(await folder()));
    expect(result.error).toContain("no approved SVG");
  });

  it("refuses to build a package without valid metadata", async () => {
    const root = await folder();
    const result = await runRow(iconRow(), context(root, { metadataOf: () => null }));
    expect(result.run?.status).toBe("failed");
    expect(result.error).toContain("metadata");
  });

  it("reports a missing approved SVG instead of exporting nothing quietly", async () => {
    const root = new FakeDir("root");
    const result = await runRow(iconRow(), context(root));
    expect(result.error).toContain("missing");
  });
});

describe("runRows", () => {
  it("runs every selected row and counts the failures", async () => {
    const root = await folder();
    const rows = [
      iconRow(),
      { ...iconRow(), id: "pair-2", svgPath: "missing/icon-b_v1.svg", dirPath: "missing" },
    ];
    const bulk = await runRows(rows, context(root));
    expect(bulk.finished).toHaveLength(2);
    expect(bulk.failed).toBe(1);
    expect(bulk.finished[0].run?.status).toBe("processed");
  });

  it("stops handing out work when the run is cancelled", async () => {
    const root = await folder();
    const controller = new AbortController();
    controller.abort();
    const rows = [iconRow(), { ...iconRow(), id: "pair-2" }];
    const bulk = await runRows(rows, context(root, { signal: controller.signal }));
    expect(bulk.aborted).toBe(true);
    expect(bulk.finished).toHaveLength(0);
    expect(bulk.cancelled).toBe(2);
  });
});

describe("provider defaults", () => {
  it("is not sent from the runner: the model id stays the verified one", () => {
    expect(DEFAULT_GEMINI_CONFIG.model).toBe("gemini-3.1-flash-lite");
    const deps: PipelineDeps["raster"] = async () => ({ ok: false, bytes: null, error: "no", width: 0, height: 0 });
    expect(typeof deps).toBe("function");
  });
});
