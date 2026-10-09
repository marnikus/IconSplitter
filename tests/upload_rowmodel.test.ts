// upload_rowmodel.test.ts — the upload list model (RULE 8): one source + its
// record + its metadata state becomes one row; staleness is exact (source hash,
// settings fingerprint, accepted-metadata fingerprint); the filters, the sort,
// the header checkbox and the counts are pure; and assembly reads the real
// export.json + source SVG from a fake folder.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { sha256HexText } from "../src/lib/upload/hash";
import {
  DEFAULT_UPLOAD_SETTINGS, settingsFingerprint, type SettingsOverrides, type UploadSettings,
} from "../src/lib/upload/settings";
import { MANDATORY_TAGS, metadataFingerprint, type IconMetadata } from "../src/lib/upload/meta";
import {
  exportDirOf, metadataBlock, newExportRecord, serializeExportRecord, type ExportRecord,
} from "../src/lib/upload/export";
import { getAppState, patchUpload, resetAppStore } from "../src/state/appstore";
import {
  assembleRows, countsOf, idsWithMetadata, metaFromRecord, pruneChecked, statusOf, staleOf, toRow,
} from "../src/upload/rowmodel";
import {
  applyUploadFilters, headerState, sortUploadRows, toListRow, visibleRows,
} from "../src/upload/rowlist";
import { ALL_UPLOAD_FILTER, EMPTY_META, type UploadRow } from "../src/upload/types";
import type { UploadRowSource } from "../src/upload/discovery";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

const DIR = "cat/split_01";
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

const TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart", "arrow", "up", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics", "report", "dashboard", "money",
  "coin", "dollar", "euro", "yen", "currency", "cash", "payment", "wallet", "bank", "investment",
  "profit", "success", "target", "goal", "idea", "creative", "design"];
const META: IconMetadata = {
  title: "Minimal line icon of growth and speed",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

let SOURCE_HASH = "";
let rows: UploadRow[] = [];

beforeAll(async () => {
  SOURCE_HASH = `sha256:${await sha256HexText(SOURCE_SVG)}`;
  rows = [
    rowOf(null, EMPTY_META, DEFAULT_UPLOAD_SETTINGS, null, "pair_none"),
    rowOf(committedRecord(DEFAULT_UPLOAD_SETTINGS, null, "pair_ok"), EMPTY_META, DEFAULT_UPLOAD_SETTINGS, SOURCE_HASH, "pair_ok"),
    { ...rowOf(committedRecord({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 20 }, null, "pair_stale"), EMPTY_META, { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 20 }, SOURCE_HASH, "pair_stale"), stale: true, status: "stale" },
  ];
});

/** One discovered source per id — distinct ids, one folder, canonical names. */
function sourceFor(id: string): UploadRowSource {
  return {
    id, base: id, suffix: "", dirPath: DIR, version: 1,
    svgPath: `${DIR}/${id}.svg`, svgName: `${id}.svg`, fingerprint: `${SOURCE_SVG.length}:3400`,
    aiPath: `${DIR}/${id}_AI.png`, metaPath: `${DIR}/${id}.svg.json`, approvedValid: 1,
  };
}

const SRC = sourceFor("pair_fog");

/** A committed record for the source `id` under the given effective settings. */
function committedRecord(effective: UploadSettings, metadata: IconMetadata | null = null, id = "pair_fog"): ExportRecord {
  const source = sourceFor(id);
  const record = newExportRecord({
    pair: { id: source.id, base: source.base, suffix: source.suffix, dir: source.dirPath },
    source: { svgPath: source.svgPath, version: source.version, approval: "approved", fingerprint: SOURCE_HASH },
    settings: { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, effective, fingerprint: settingsFingerprint(effective) },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" },
    epsEnabled: false,
  });
  record.outputs = {
    svg: { path: `${exportDirOf(DIR)}/${id}.svg`, bytes: 10, hash: "sha256:x" },
    jpg: { path: `${exportDirOf(DIR)}/${id}.jpg`, bytes: 10, hash: "sha256:y" },
    eps: null,
  };
  record.metadata = metadata === null ? null : metadataBlock(metadata, {
    prompt: "p", provider: "Gemini", model: "m", requestId: null,
    usage: { input: 1, output: 2, total: 3 }, fingerprint: metadataFingerprint(metadata),
    validation: { ok: true, errors: [], warnings: [] },
  });
  record.stage = "committed";
  record.status = "processed";
  return record;
}

function rowOf(record: ExportRecord | null, meta = EMPTY_META, effective = DEFAULT_UPLOAD_SETTINGS, sourceHash: string | null = SOURCE_HASH, id = "pair_fog"): UploadRow {
  return toRow(sourceFor(id), { record, sourceHash, meta, effective });
}

const ACCEPTED = { state: "accepted", metadata: META, validation: null, usage: { input: null, output: null, total: null }, detail: "", edited: false } as const;

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
});

describe("toRow + staleOf — staleness is exact", () => {
  it("a row without a record is discovered, never stale", () => {
    const row = rowOf(null, EMPTY_META, DEFAULT_UPLOAD_SETTINGS, null);
    expect(row.status).toBe("discovered");
    expect(row.stale).toBe(false);
    expect(row.record).toBeNull();
  });

  it("a committed record matching every fingerprint is processed, not stale", () => {
    const row = rowOf(committedRecord(DEFAULT_UPLOAD_SETTINGS));
    expect(row.status).toBe("processed");
    expect(row.stale).toBe(false);
  });

  it("the EPS writer's automatic fixes become the row's note; the row stays processed (2026-10-08)", () => {
    const record = committedRecord(DEFAULT_UPLOAD_SETTINGS);
    record.tools.eps = { ...record.tools.eps, fixes: ["1 rounded <rect> written as an exact path outline"] };
    const row = rowOf(record);
    expect(row.status).toBe("processed");
    expect(row.error).toBe("");
    expect(row.note).toBe("EPS auto-fixed: 1 rounded <rect> written as an exact path outline");
    expect(rowOf(committedRecord(DEFAULT_UPLOAD_SETTINGS)).note).toBe(""); // no fixes → no note
    expect(rowOf(null, EMPTY_META, DEFAULT_UPLOAD_SETTINGS, null).note).toBe("");
  });

  it("a settings change marks the row stale", () => {
    const changed = { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: 20 };
    expect(staleOf({ record: committedRecord(DEFAULT_UPLOAD_SETTINGS), source: SRC, effective: changed, meta: EMPTY_META, sourceHash: SOURCE_HASH })).toBe(true);
    expect(staleOf({ record: committedRecord(changed), source: SRC, effective: changed, meta: EMPTY_META, sourceHash: SOURCE_HASH })).toBe(false);
  });

  it("a source change (hash, path or version) marks the row stale", () => {
    const record = committedRecord(DEFAULT_UPLOAD_SETTINGS);
    expect(staleOf({ record, source: SRC, effective: DEFAULT_UPLOAD_SETTINGS, meta: EMPTY_META, sourceHash: "sha256:other" })).toBe(true);
    expect(staleOf({ record, source: { ...SRC, svgPath: `${DIR}/other.svg` }, effective: DEFAULT_UPLOAD_SETTINGS, meta: EMPTY_META, sourceHash: SOURCE_HASH })).toBe(true);
    expect(staleOf({ record, source: { ...SRC, version: 2 }, effective: DEFAULT_UPLOAD_SETTINGS, meta: EMPTY_META, sourceHash: SOURCE_HASH })).toBe(true);
  });

  it("accepted metadata the record does not carry (or carries differently) is stale", () => {
    expect(staleOf({ record: committedRecord(DEFAULT_UPLOAD_SETTINGS), source: SRC, effective: DEFAULT_UPLOAD_SETTINGS, meta: ACCEPTED, sourceHash: SOURCE_HASH })).toBe(true);
    expect(staleOf({ record: committedRecord(DEFAULT_UPLOAD_SETTINGS, META), source: SRC, effective: DEFAULT_UPLOAD_SETTINGS, meta: ACCEPTED, sourceHash: SOURCE_HASH })).toBe(false);
    const edited = { ...ACCEPTED, metadata: { ...META, description: "Edited by hand to fourteen words exactly as required now" } };
    expect(staleOf({ record: committedRecord(DEFAULT_UPLOAD_SETTINGS, META), source: SRC, effective: DEFAULT_UPLOAD_SETTINGS, meta: edited, sourceHash: SOURCE_HASH })).toBe(true);
  });
});

describe("metaFromRecord + statusOf", () => {
  it("an accepted record block restores the accepted metadata", () => {
    const meta = metaFromRecord(committedRecord(DEFAULT_UPLOAD_SETTINGS, META), false);
    expect(meta.state).toBe("accepted");
    expect(meta.metadata).toEqual(META);
  });

  it("cleans the record's title — a pre-fix package reads back the clean text and reports stale", () => {
    const old = committedRecord(DEFAULT_UPLOAD_SETTINGS, { ...META, title: "Minimal Line Icon Of Growth. Speed and growth pictogram." });
    const meta = metaFromRecord(old, false);
    expect(meta.metadata?.title).toBe("Minimal line icon of growth. Speed and growth pictogram"); // both sentences, no final period
    // the block still carries the uncleaned fingerprint → the FILE must move
    expect(staleOf({ record: old, source: SRC, effective: DEFAULT_UPLOAD_SETTINGS, meta, sourceHash: SOURCE_HASH })).toBe(true);
  });

  it("an invalid or missing block leaves the fields empty", () => {
    expect(metaFromRecord(committedRecord(DEFAULT_UPLOAD_SETTINGS), false).state).toBe("empty");
    const invalid = committedRecord(DEFAULT_UPLOAD_SETTINGS, META);
    invalid.metadata = { ...invalid.metadata!, state: "invalid" };
    expect(metaFromRecord(invalid, false).state).toBe("empty");
  });

  it("a journalled in-flight request reports interrupted, never resent", () => {
    const meta = metaFromRecord(null, true);
    expect(meta.state).toBe("interrupted");
    expect(meta.detail).toContain("outcome is unknown");
  });

  it("a run in flight wins over the stored status", () => {
    const row = rowOf(committedRecord(DEFAULT_UPLOAD_SETTINGS));
    expect(statusOf({ ...row, running: "metadata" })).toBe("metadata");
    expect(statusOf({ ...row, running: "export", stage: "render" })).toBe("render");
    expect(statusOf(row)).toBe("processed");
  });
});

describe("filters, sort, header, counts", () => {

  it("finds only selected rows whose metadata already exists, in row order", () => {
    const draft = rowOf(null, { ...EMPTY_META, state: "generated", metadata: META }, DEFAULT_UPLOAD_SETTINGS, null, "pair_draft");
    const accepted = rowOf(null, ACCEPTED, DEFAULT_UPLOAD_SETTINGS, null, "pair_accepted");
    const empty = rowOf(null, EMPTY_META, DEFAULT_UPLOAD_SETTINGS, null, "pair_empty");
    expect(idsWithMetadata([draft, empty, accepted], ["pair_empty", "pair_accepted", "pair_draft", "pair_gone"]))
      .toEqual(["pair_draft", "pair_accepted"]);
  });

  it("filters by package status, metadata state and search text", () => {
    const list = rows.map(toListRow);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, status: "not-exported" }).map((r) => r.id)).toEqual(["pair_none"]);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, status: "stale" }).map((r) => r.id)).toEqual(["pair_stale"]);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, status: "processed" }).map((r) => r.id)).toEqual(["pair_ok"]);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, search: "split_01" })).toHaveLength(3);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, search: "pair_ok" })).toHaveLength(1);
    expect(applyUploadFilters(list, { ...ALL_UPLOAD_FILTER, search: "nope" })).toHaveLength(0);
  });

  it("sorts by name, status and metadata without reordering the input", () => {
    const list = rows.map(toListRow);
    const input = [...list];
    expect(sortUploadRows(list, "name").map((r) => r.id)).toEqual(["pair_none", "pair_ok", "pair_stale"]);
    expect(sortUploadRows(list, "status").map((r) => r.status)).toEqual(["stale", "not-exported", "processed"]);
    expect(list).toEqual(input); // the caller's array untouched
  });

  it("visibleRows maps the filtered list back to the row objects", () => {
    const visible = visibleRows(rows, { ...ALL_UPLOAD_FILTER, status: "processed" }, "name");
    expect(visible).toHaveLength(1);
    expect(visible[0].source.id).toBe("pair_ok");
    expect(visible[0].record?.status).toBe("processed");
  });

  it("the header checkbox is none/some/all over the visible rows", () => {
    expect(headerState(rows, [])).toBe("none");
    expect(headerState(rows, ["pair_ok"])).toBe("some");
    expect(headerState(rows, rows.map((r) => r.source.id))).toBe("all");
    expect(headerState([], ["pair_ok"])).toBe("none");
  });

  it("counts come straight off the rows", () => {
    expect(countsOf(rows)).toEqual({ icons: 3, processed: 1, partial: 0, failed: 0, stale: 1, accepted: 0 });
  });

  it("counts a failed run even though nothing committed (record stays null)", () => {
    const failed = { ...rowOf(null, EMPTY_META, DEFAULT_UPLOAD_SETTINGS, null), status: "failed" as const, running: null };
    const counts = countsOf([failed]);
    expect(counts.failed).toBe(1);
    expect(counts.processed).toBe(0);
  });

  it("a row mid-run is counted nowhere — the running counter owns it", () => {
    const running = { ...rowOf(committedRecord(DEFAULT_UPLOAD_SETTINGS)), running: "export" as const, stage: "render" as const };
    const counts = countsOf([running]);
    expect(counts.processed).toBe(0);
    expect(counts.failed).toBe(0);
  });

  it("pruneChecked drops checked ids a rescan removed", () => {
    patchUpload({ checked: ["pair_ok", "pair_gone"] });
    pruneChecked(rows);
    expect(getAppState().upload.checked).toEqual(["pair_ok"]);
  });
});

describe("assembleRows — reads the real record + source from the folder", () => {
  function pairRoot(id: string, withRecord: boolean, withMetadata: boolean): BinDir {
    const root = new BinDir("root");
    const dir = new BinDir("split_01");
    dir.children.set(`${id}_AI.png`, new BinFile(`${id}_AI.png`, "ai", 3100));
    dir.children.set(`${id}.svg`, new BinFile(`${id}.svg`, SOURCE_SVG, 3400));
    const meta = pairFile(DIR, `${id}_AI.png`, { versions: [svgVersion(`${DIR}/${id}.svg`, { version: 1, review: "approved" })] });
    dir.children.set(`${id}.svg.json`, new BinFile(`${id}.svg.json`, serializePairMeta(meta), 3300));
    const cat = new BinDir("cat");
    cat.children.set("split_01", dir);
    root.children.set("cat", cat);
    if (withRecord) {
      const exp = new BinDir("export");
      exp.children.set("export.json", new BinFile("export.json", serializeExportRecord(committedRecord(DEFAULT_UPLOAD_SETTINGS, withMetadata ? META : null, id)), 5000));
      dir.children.set("export", exp);
    }
    return root;
  }

  it("assembles a committed row: record, source hash, not stale", async () => {
    const rows = await assembleRows(pairRoot("pair_fog", true, false), [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set() });
    expect(rows).toHaveLength(1);
    expect(rows[0].record?.status).toBe("processed");
    expect(rows[0].sourceHash).toBe(SOURCE_HASH);
    expect(rows[0].stale).toBe(false);
    expect(rows[0].meta.state).toBe("empty");
  });

  it("restores accepted metadata from the record", async () => {
    const rows = await assembleRows(pairRoot("pair_fog", true, true), [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set() });
    expect(rows[0].meta.state).toBe("accepted");
    expect(rows[0].meta.metadata?.tags).toHaveLength(40);
  });

  it("a pair without export.json is discovered, and still carries its source fingerprint", async () => {
    // The fingerprint is read even with no record: it is the key the accepted-
    // metadata cache (CP-15) is found by, and a row that cannot name its own
    // artwork could not be served a remembered answer without a model call.
    const rows = await assembleRows(pairRoot("pair_fog", false, false), [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set() });
    expect(rows[0].record).toBeNull();
    expect(rows[0].status).toBe("discovered");
    expect(rows[0].sourceHash).toBe(`sha256:${await sha256HexText(SOURCE_SVG)}`);
  });

  it("a run the previous session left unresolved shows interrupted, not discovered (CP-2)", async () => {
    const rows = await assembleRows(pairRoot("pair_fog", false, false), [SRC], {
      defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set(), interruptedJobs: new Set(["pair_fog"]),
    });
    expect(rows[0].status).toBe("interrupted");
    expect(rows[0].stale).toBe(false);
  });

  it("a committed record outweighs the memory — disk wins on scan", async () => {
    const rows = await assembleRows(pairRoot("pair_fog", true, true), [SRC], {
      defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set(), interruptedJobs: new Set(["pair_fog"]),
    });
    expect(rows[0].status).toBe("processed");
  });

  it("a corrupt export.json is null — the pipeline rebuilds it", async () => {
    const root = pairRoot("pair_fog", false, false);
    const dir = (root.children.get("cat") as BinDir).children.get("split_01") as BinDir;
    const exp = new BinDir("export");
    exp.children.set("export.json", new BinFile("export.json", "{corrupt", 5000));
    dir.children.set("export", exp);
    const rows = await assembleRows(root, [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set() });
    expect(rows[0].record).toBeNull();
    expect(rows[0].status).toBe("discovered");
  });

  it("an override on the row marks it stale against the committed record", async () => {
    const overrides: Record<string, SettingsOverrides> = { pair_fog: { paddingPct: 30 } };
    const rows = await assembleRows(pairRoot("pair_fog", true, false), [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides, interrupted: new Set() });
    expect(rows[0].stale).toBe(true);
    expect(rows[0].status).toBe("stale");
  });

  it("a journalled in-flight request marks the row's metadata interrupted", async () => {
    const rows = await assembleRows(pairRoot("pair_fog", false, false), [SRC], { defaults: DEFAULT_UPLOAD_SETTINGS, overrides: {}, interrupted: new Set(["pair_fog"]) });
    expect(rows[0].meta.state).toBe("interrupted");
  });
});
