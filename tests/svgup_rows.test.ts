// svgup_rows.test.ts — what the SVG-to-upload list is built from (design §2/§5).
// The rules the request states as acceptance: a row exists only for an APPROVED
// pair, shows the CHOSEN version's SVG (never the AI image beside it), names the
// export files after the icon base, and carries every reason it is not usable as
// a VISIBLE warning — a missing or changed source is reported, never silently
// substituted. Export outputs are excluded, so a second scan can never export an
// export (the loop the design forbids).
import { describe, expect, it } from "vitest";
import { newPairMeta, withVersion, serializePairMeta, parsePairMeta } from "../src/lib/pairmeta";
import { withPreferred } from "../src/lib/pairpreferred";
import type { SvgVersion } from "../src/lib/svgmodel";
import {
  buildUploadRow, buildUploadRows, exportBaseName, isExportOutput,
  type UploadSourceInput,
} from "../src/lib/svgupload/rows";

const DIR = "_split_output/2026-10/2026-10-05_23-30-19/icon-trophy_AI_7/split_04";

function version(n: number, over: Partial<SvgVersion> = {}): SvgVersion {
  return {
    version: n,
    svgPath: `${DIR}/icon-trophy_AI_7_04${n > 1 ? `_v${n}` : ""}.svg`,
    status: "generated",
    review: "approved",
    prompt: "", provider: "requesty", model: "gemini", requestedAt: "2026-10-05T21:30:19Z",
    completedAt: "2026-10-05T21:30:40Z",
    usage: { input: 10, output: 20, total: 30 }, cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 1 },
    batch: null, error: null, requestId: "req_1", ...over,
  };
}

function metaWith(versions: SvgVersion[], preferred: number | null) {
  const base = newPairMeta({
    id: "pair_90cf3e3d", base: "icon-trophy_AI_7", suffix: "04", dirPath: DIR,
    ai: { relPath: `${DIR}/icon-trophy_AI_7_04.png`, name: "icon-trophy_AI_7_04.png", fingerprint: "1:2" },
    source: null,
  });
  const withVersions = versions.reduce(withVersion, base);
  return preferred === null ? withVersions : withPreferred(withVersions, preferred);
}

const source = (over: Partial<UploadSourceInput> = {}): UploadSourceInput => ({
  id: "pair_90cf3e3d",
  name: "icon-trophy_AI_7_04.png",
  relPath: `${DIR}/icon-trophy_AI_7_04.png`,
  dirPath: DIR,
  metaPath: `${DIR}/icon-trophy_AI_7.svg.json`,
  problems: [],
  ...over,
});

describe("exportBaseName — every output of one icon shares one base name", () => {
  it("drops the version suffix and the extension", () => {
    expect(exportBaseName("icon-trophy_AI_7_04_v2.svg")).toBe("icon-trophy_AI_7_04");
    expect(exportBaseName("icon-trophy_AI_7_04.svg")).toBe("icon-trophy_AI_7_04");
  });

  it("keeps a name that merely looks versioned in the middle", () => {
    expect(exportBaseName("version_2_badge_v9.svg")).toBe("version_2_badge");
  });
});

describe("isExportOutput — an export can never become a source", () => {
  it("treats any path inside an export folder as an output", () => {
    expect(isExportOutput(`${DIR}/export/icon-trophy_AI_7_04.svg`)).toBe(true);
    expect(isExportOutput(`${DIR}/export/icon-trophy_AI_7_04.jpg`)).toBe(true);
    expect(isExportOutput("export/x.svg")).toBe(true);
  });

  it("leaves a folder that merely mentions it alone", () => {
    expect(isExportOutput(`${DIR}/exports/icon.svg`)).toBe(false);
    expect(isExportOutput(`${DIR}/icon-export.svg`)).toBe(false);
  });
});

describe("buildUploadRow — one row, one approved SVG", () => {
  it("shows the chosen version's file and its version label", () => {
    const row = buildUploadRow({ source: source(), meta: metaWith([version(1), version(2)], 2) });
    expect(row.id).toBe("pair_90cf3e3d");
    expect(row.svgPath).toBe(`${DIR}/icon-trophy_AI_7_04_v2.svg`);
    expect(row.version).toBe(2);
    expect(row.versionLabel).toBe("v2 (preferred)");
    expect(row.exportBase).toBe("icon-trophy_AI_7_04");
    expect(row.warnings).toEqual([]);
    expect(row.blocked).toBeNull();
  });

  it("falls back to the newest valid version when nobody preferred one", () => {
    const row = buildUploadRow({ source: source(), meta: metaWith([version(1), version(2)], null) });
    expect(row.svgPath).toBe(`${DIR}/icon-trophy_AI_7_04_v2.svg`);
    expect(row.versionLabel).toBe("v2");
  });

  it("uses the user's preference even when a newer version exists", () => {
    const row = buildUploadRow({ source: source(), meta: metaWith([version(1), version(2), version(3)], 1) });
    expect(row.svgPath).toBe(`${DIR}/icon-trophy_AI_7_04.svg`);
    expect(row.versionLabel).toBe("v1 (preferred)");
  });

  it("carries NO AI-image reference — the row is the SVG", () => {
    const row = buildUploadRow({ source: source(), meta: metaWith([version(2)], null) });
    expect(Object.keys(row)).not.toContain("aiPath");
    expect(Object.keys(row)).not.toContain("aiName");
    expect(row.svgPath?.endsWith(".svg")).toBe(true);
  });

  it("blocks a pair whose versions are all failed, and says why", () => {
    const failed = version(1, { status: "failed", error: "provider refused", validation: { ok: false, errors: ["no svg"], warnings: [], icons: 0 } });
    const row = buildUploadRow({ source: source(), meta: metaWith([failed], null) });
    expect(row.blocked).toBe("No usable SVG version — regenerate in Generate SVG");
    expect(row.warnings.some((w) => w.includes("provider refused"))).toBe(true);
  });

  it("blocks a pair with no pair file at all instead of inventing a path", () => {
    const row = buildUploadRow({ source: source(), meta: null });
    expect(row.blocked).toBe("No usable SVG version — regenerate in Generate SVG");
    expect(row.svgPath).toBeNull();
  });

  it("reports a missing source file visibly (a warning, not a silent skip)", () => {
    const row = buildUploadRow({
      source: source({ problems: [{ kind: "ai-missing", relPath: null, reason: "no AI result beside x" }] }),
      meta: metaWith([version(1)], null),
    });
    expect(row.warnings).toContain("AI image missing");
    expect(row.svgPath).not.toBeNull(); // still listed: the user must see it
  });

  it("reports a chosen SVG that is not in the scanned file set", () => {
    const row = buildUploadRow({
      source: source(), meta: metaWith([version(1)], null),
      exists: () => false,
    });
    expect(row.blocked).toBe("The chosen SVG is not on disk — rescan or regenerate");
    expect(row.warnings.some((w) => w.includes("not found"))).toBe(true);
  });

  it("keeps the fingerprint of the chosen file for staleness checks", () => {
    const row = buildUploadRow({
      source: source(), meta: metaWith([version(1), version(2)], 2),
      fingerprintOf: (rel) => (rel.endsWith("_v2.svg") ? "2048:1730000001" : "1024:1730000000"),
    });
    expect(row.fingerprint).toBe("2048:1730000001");
    expect(buildUploadRow({ source: source(), meta: metaWith([version(1)], null) }).fingerprint).toBe("");
  });
});

describe("buildUploadRows — the list rules", () => {
  it("excludes export outputs and sorts by path", () => {
    const rows = buildUploadRows([
      { source: source({ id: "a", relPath: "z/split_01/a.png", dirPath: "z/split_01" }), meta: null },
      { source: source({ id: "b", relPath: `${DIR}/export/icon.svg`, dirPath: `${DIR}/export` }), meta: null },
      { source: source({ id: "c", relPath: "a/split_01/c.png", dirPath: "a/split_01" }), meta: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("survives a real pair file through the serializer", () => {
    const load = parsePairMeta(serializePairMeta(metaWith([version(1), version(2)], 2)));
    expect(load.ok).toBe(true);
    const row = buildUploadRow({ source: source(), meta: load.ok ? load.meta : null });
    expect(row.svgPath).toBe(`${DIR}/icon-trophy_AI_7_04_v2.svg`);
  });
});
