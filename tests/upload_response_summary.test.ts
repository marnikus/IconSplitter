import { describe, expect, it } from "vitest";
import { committedArtifactCount, planDownload } from "../src/lib/upload/download";
import { newExportRecord, ARTIFACT_EXTS } from "../src/lib/upload/export";
import { DEFAULT_UPLOAD_SETTINGS, settingsFingerprint, type SettingsOverrides } from "../src/lib/upload/settings";
import { patchSettingsMap } from "../src/lib/upload/settingspatch";
import { uploadBulkSummary } from "../src/upload/bulksummary";
import { idsNeedingMetadata, idsWithMetadata } from "../src/upload/rowmodel";
import { idsAwaitingAcceptance } from "../src/upload/metaaccept";
import { selectedDecorations } from "../src/upload/decorationselection";
import { selectedShadow } from "../src/upload/shadowselection";
import { selectedBadge } from "../src/upload/badgeselection";
import { selectedSizeGuide } from "../src/upload/sizeguideselection";
import { selectionLoad } from "./helpers/selectionload";

function recordWith(mask: number) {
  const effective = DEFAULT_UPLOAD_SETTINGS;
  const record = newExportRecord({
    pair: { id: "fixture", base: "icon", suffix: "", dir: "fixture" },
    source: { svgPath: "fixture/icon.svg", version: 1, approval: "approved", fingerprint: "fixture" },
    settings: { defaults: effective, overrides: {}, effective, fingerprint: settingsFingerprint(effective) },
    svgo: { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" }, epsEnabled: true,
  });
  ARTIFACT_EXTS.forEach((ext, i) => { record.outputs[ext] = (mask & (1 << i)) ? { path: `fixture/export/icon.${ext}`, bytes: 1, hash: "fixture" } : null; });
  return record;
}

describe("count-only Upload summaries", () => {
  it.each(Array.from({ length: 8 }, (_, i) => i))("matches exact download eligibility for artifact mask %i", (mask) => {
    const rows = [null, recordWith(mask), recordWith(7)].map((record, i) => ({ id: String(i), base: "icon", record }));
    const plan = planDownload(rows);
    expect(rows.reduce((n, r) => n + committedArtifactCount(r.record), 0)).toBe(plan.items.length);
    expect(plan.items.filter((item) => item.id === "2").map((item) => item.to)).toEqual(
      mask === 0 ? ["icon.svg", "icon.jpg", "icon.eps"] : ["icon (2).svg", "icon (2).jpg", "icon (2).eps"],
    );
  });

  it("counts all metadata categories like the original selectors, including edited accepted rows and hidden checks", () => {
    const { upload: rows, ids } = selectionLoad(8);
    rows.forEach((row, i) => {
      row.record = i === 0 ? null : recordWith(i);
      row.meta = { ...row.meta, state: ["empty", "pending", "generated", "invalid", "accepted", "accepted", "interrupted", "generated"][i] as typeof row.meta.state,
        metadata: i === 0 || i === 1 ? null : { title: "Fixture", description: "Fixture", tags: [] }, edited: i === 5 };
    });
    for (const checked of [[], ids, ids.slice(2, 7), [ids[0], ids[0], "missing", ids[5]]]) {
      expect(uploadBulkSummary(rows, checked)).toEqual({
        needed: idsNeedingMetadata(rows, checked).length,
        withMeta: idsWithMetadata(rows, checked).length,
        awaiting: idsAwaitingAcceptance(rows, checked).length,
        download: planDownload(rows.filter((row) => checked.includes(row.source.id)).map((row) => ({ id: row.source.id, base: row.source.base, record: row.record }))).items.length,
      });
    }
  });
});

describe("one-copy settings replacement", () => {
  it("preserves inputs, unknown ids, explicit null-valued fields and applied-map aliases", () => {
    const map = Object.freeze({ kept: { strokePx: 2 }, drop: { strokePx: 3 }, empty: { strokePx: 4 } });
    const patch = Object.freeze({ drop: null, empty: {}, fresh: { paddingPct: null } });
    const next = patchSettingsMap(map, patch);
    expect(next).toEqual({ kept: { strokePx: 2 }, fresh: { paddingPct: null } });
    expect(next.kept).toBe(map.kept);
    expect(Object.keys(map)).toEqual(["kept", "drop", "empty"]);
    expect(patchSettingsMap(map, undefined)).toBe(map);
    expect(patchSettingsMap(map, {})).toBe(map);
    expect(patchSettingsMap({}, { a: { shadowEnabled: false } })).toEqual({ a: { shadowEnabled: false } });
  });
  it("reads the initial map and patch entries only once and retains exact per-id replacement", () => {
    let reads = 0, patchReads = 0;
    const map: Record<string, SettingsOverrides> = {}, patch: Record<string, SettingsOverrides> = {};
    for (let i = 0; i < 1000; i++) {
      Object.defineProperty(map, String(i), { enumerable: true, get: () => { reads++; return { strokePx: 2 }; } });
      Object.defineProperty(patch, String(i), { enumerable: true, get: () => { patchReads++; return { jpegQuality: 0.7 }; } });
    }
    const next = patchSettingsMap(map, patch);
    expect(reads).toBe(1000); expect(patchReads).toBe(1000);
    expect(Object.values(next).every((value) => value.strokePx === undefined && value.jpegQuality === 0.7)).toBe(true);
  });
});

describe("shared selected-decoration summaries", () => {
  it("preserves empty/default, mixed geometry, off flags and local-over-applied precedence", () => {
    const defaults = { ...DEFAULT_UPLOAD_SETTINGS, shadowWidthPct: 72, shadowGapPct: 8 };
    const overrides = { a: { shadowEnabled: true, shadowWidthPct: 80, badgeEnabled: false }, b: { shadowEnabled: true, shadowWidthPct: 90 }, c: { sizeGuideEnabled: true } };
    const applied = { a: { badgeEnabled: true, sizeGuideEnabled: false }, b: { badgeEnabled: true, sizeGuideEnabled: true } };
    for (const ids of [[], ["a"], ["a", "b"], ["a", "b", "c", "unloaded"]]) {
      const summary = selectedDecorations(ids, defaults, overrides, applied);
      expect(summary).toEqual({ shadow: selectedShadow(ids, defaults, overrides, applied),
        badge: selectedBadge(ids, defaults, overrides, applied), sizeGuide: selectedSizeGuide(ids, defaults, overrides, applied) });
    }
    expect(selectedDecorations(["a", "b"], defaults, overrides, applied).shadow).toEqual({ state: "all", width: null, gap: 8 });
    expect(selectedDecorations(["a"], defaults, overrides, applied).badge.state).toBe("none");
  });
});
