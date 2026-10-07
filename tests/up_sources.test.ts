// up_sources.test.ts — the upload tab's discovery (design §4), executed
// against the REAL discovery walk over a fake file tree (RULE 8): one row per
// approved pair with an approved generated SVG, the chosen-version rule
// (preferred when approved, else highest approved), the no-approved-svg
// exclusion, the missing-file warning, the export-folder loop prevention, and
// the scan-time export-state classification from export.json.
import { describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { loadPairDecisions } from "../src/selection/pairstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { discoverApprovedSources } from "../src/svg/sources";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import { buildExportRecord } from "../src/lib/upexport";
import { DEFAULT_EXPORT_SETTINGS } from "../src/lib/upsettings";
import { classifyExport, discoverUploadRows, type ExportDirScan } from "../src/upload/sources";

const DIR = "pairs";
const META: IconMetadata = {
  title: "Forward Motion and Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

interface PairSpec {
  base: string;
  versions: ReturnType<typeof svgVersion>[];
  preferred?: number | null;
  /** The chosen SVG file exists on disk unless false. */
  svgOnDisk?: boolean;
}

function pairIdOf(base: string): string {
  // parseAiName("x_AI.png") → base "x", suffix "" — the same parse the scan uses
  return pairId(DIR, base, "");
}

async function buildRoot(pairs: PairSpec[]): Promise<FakeDir> { // the sidecar text is serializePairMeta — the app's own shape
  const root = new FakeDir("test_upload");
  const folder = new FakeDir(DIR);
  root.children.set(DIR, folder);
  const records: { pair_id: string; source: string | null; ai_result: string | null; decision: string; reviewed_at: string }[] = [];
  for (const p of pairs) {
    const ai = `${p.base}_AI.png`;
    folder.children.set(ai, new FakeFile(ai, 20, 3100, "ai"));
    const meta = pairFile(DIR, ai, { id: pairIdOf(p.base), decision: "approved", versions: p.versions, preferred: p.preferred ?? null });
    folder.children.set(`${p.base}_AI.svg.json`, new FakeFile(`${p.base}_AI.svg.json`, 10, 3300, serializePairMeta(meta)));
    for (const v of p.versions) {
      if (p.svgOnDisk !== false && v.status === "generated") {
        const fileName = v.svgPath.split("/").pop() as string;
        folder.children.set(fileName, new FakeFile(fileName, 40, 3300, "<svg/>"));
      }
    }
    records.push({ pair_id: pairIdOf(p.base), source: null, ai_result: `${DIR}/${ai}`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  }
  // An AI image inside an export/ folder, approved by a record: the walk must
  // ignore the folder, so this feature's own output can never re-enter.
  const evil = new FakeDir("export");
  folder.children.set("export", evil);
  evil.children.set("evil_AI.png", new FakeFile("evil_AI.png", 20, 3100, "ai"));
  records.push({ pair_id: pairId("pairs/export", "evil", "_AI"), source: null, ai_result: `${DIR}/export/evil_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records })));
  return root;
}

/** A scan payload with the v2 fields filled in — the shape scanExportDir returns. */
function scanOf(over: Partial<ExportDirScan>): ExportDirScan {
  return { exportJson: null, outputs: [], generation: null, legacy: false, corruptPointer: false, ...over };
}

/** The v2 record a committed generation holds, for one base. */
function recordFor(base: string, generation = "gen-1"): ReturnType<typeof buildExportRecord> {
  return buildExportRecord({
    pairId: pairIdOf(base),
    iconBase: base, rootName: "root", dirPath: DIR,
    source: { relPath: `${DIR}/${base}_AI_v3.svg`, version: 3, sha256: "abc", bytes: 1200 },
    settings: { ...DEFAULT_EXPORT_SETTINGS },
    metadata: META,
    provenance: {
      origin: "user", prompt: "p", model: "", endpointHost: "",
      requestId: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null,
      generatedAt: "2026-10-07T10:00:00.000Z", policy: "upload-meta-v2",
    },
    requested: { svg: true, jpeg: true, eps: false },
    outputs: {
      svg: { relPath: `${DIR}/export/generations/${generation}/${base}.svg`, bytes: 900, sha256: "d1", optimizer: null },
      jpeg: { relPath: `${DIR}/export/generations/${generation}/${base}.jpg`, bytes: 500_000, sha256: "d2", width: 3886, height: 3886, mpx: 15.1, quality: 0.92 },
      eps: null,
    },
    generation,
    state: "processed",
    failure: null,
    committedAt: "2026-10-07T10:00:00.000Z",
  });
}

/** What scanExportDir reports for a committed generation: the record text. */
function recordJsonFor(base: string, generation = "gen-1"): string {
  return JSON.stringify(recordFor(base, generation));
}

function readerFor(scans: Record<string, ExportDirScan>) {
  return async (dirPath: string): Promise<ExportDirScan> => scans[dirPath] ?? scanOf({});
}

describe("upload sources — rows, chosen versions, exclusions", () => {
  it("lists one row per approved pair with an approved generated SVG", async () => {
    const root = await buildRoot([
      { base: "icon-a", preferred: 3, versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" }), svgVersion(`${DIR}/icon-a_AI_v3.svg`, { version: 3, review: "approved" })] },
      { base: "icon-b", versions: [svgVersion(`${DIR}/icon-b_AI_v1.svg`, { version: 1, review: "pending" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({}));
    expect(found.rows.map((r) => r.iconBase)).toEqual(["icon-a"]);
    expect(found.noApprovedSvg.map((e) => e.name)).toEqual(["icon-b_AI.png"]);
    const a = found.rows[0];
    expect(a.id).toBe(pairIdOf("icon-a"));
    expect(a.version).toBe(3); // the preferred version, and it is approved
    expect(a.svgRelPath).toBe(`${DIR}/icon-a_AI_v3.svg`);
    expect(a.svgFingerprint).toBe("6:3300"); // the file's real content size, like every fingerprint
    expect(a.warnings).toEqual([]);
  });

  it("falls back to the highest approved version when preferred is not approved", async () => {
    const root = await buildRoot([
      { base: "icon-c", preferred: 1, versions: [svgVersion(`${DIR}/icon-c_AI_v1.svg`, { version: 1, review: "pending" }), svgVersion(`${DIR}/icon-c_AI_v2.svg`, { version: 2, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({}));
    expect(found.rows[0].version).toBe(2);
  });

  it("a missing SVG file on a listed row is a warning, never a removal", async () => {
    const root = await buildRoot([
      { base: "icon-d", svgOnDisk: false, versions: [svgVersion(`${DIR}/icon-d_AI_v2.svg`, { version: 2, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({}));
    expect(found.rows.map((r) => r.iconBase)).toEqual(["icon-d"]);
    expect(found.rows[0].warnings).toEqual(["chosen-svg-missing"]);
    expect(found.rows[0].svgFingerprint).toBeNull();
  });

  it("never discovers this feature's own outputs as sources (export folders ignored)", async () => {
    const root = await buildRoot([
      { base: "icon-a", versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({}));
    expect(found.rows.some((r) => r.iconBase === "evil")).toBe(false);
    const raw = await discoverApprovedSources(root, ["export"]);
    expect(raw.entries.some((e) => e.relPath.includes("/export/"))).toBe(false);
    const withoutIgnore = await discoverApprovedSources(root);
    expect(withoutIgnore.entries.some((e) => e.relPath.includes("/export/"))).toBe(true);
  });
});

describe("upload sources — scan-time export state (design §9)", () => {
  it("a valid committed export.json supplies the processed state", async () => {
    const root = await buildRoot([
      { base: "icon-a", versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({ [DIR]: scanOf({ exportJson: recordJsonFor("icon-a"), outputs: ["icon-a.svg", "icon-a.jpg"], generation: "gen-1" }) }));
    expect(found.rows[0].exportState).toBe("processed");
    expect(found.rows[0].record?.iconBase).toBe("icon-a");
  });

  it("outputs without a valid export.json are interrupted (needs review, never auto-resumed)", async () => {
    const root = await buildRoot([
      { base: "icon-a", versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({ [DIR]: scanOf({ exportJson: "{corrupt", outputs: ["icon-a.svg"] }) }));
    expect(found.rows[0].exportState).toBe("interrupted");
    expect(found.rows[0].record).toBeNull();
  });

  it("nothing exported yet is discovered", async () => {
    const root = await buildRoot([
      { base: "icon-a", versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })] },
    ]);
    const found = await discoverUploadRows(root, readerFor({}));
    expect(found.rows[0].exportState).toBe("discovered");
  });

  it("classifyExport keeps the pure rules visible", () => {
    expect(classifyExport(scanOf({}))).toEqual({ state: "discovered", record: null });
    expect(classifyExport(scanOf({ exportJson: "junk" })).state).toBe("interrupted");
    expect(classifyExport(scanOf({ outputs: ["x.svg"] })).state).toBe("interrupted");
    // A v1 folder is a foreign package: stale, and never misread as "not exported".
    expect(classifyExport(scanOf({ legacy: true, outputs: ["x.svg"] })).state).toBe("stale");
  });
});

describe("upload sources — the sidecar shape is the app's own", () => {
  it("loads the pair metas the SVG tab itself writes", async () => {
    const root = await buildRoot([
      { base: "icon-a", versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })] },
    ]);
    const load = await loadPairDecisions(root, (await discoverApprovedSources(root, ["export"])).entries);
    expect(load.metas.get(pairIdOf("icon-a"))?.versions.length).toBe(1);
  });
});
