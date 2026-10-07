// sources.ts — approved-source discovery for the SVG-to-upload tab (design §4).
// Owns: turning the Generate SVG tab's discovery (the SAME walk, with `export`
// directories ignored so this feature's own outputs can never re-enter as
// sources) into upload rows — one row per approved pair that has at least one
// generated AND review-approved SVG version, the chosen version (the pair's
// preferred when approved, else the highest approved), warnings instead of
// silent removals, and the scan-time export-state classification from the
// committed export.json. The export folder is read through an injected reader
// so the discovery stays testable (RULE 8).

import { discoverApprovedSources, type FileProblem } from "../svg/sources";
import type { SourceExclusion } from "../svg/sourcelist";
import type { DirHandleLike, } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import type { SvgVersion } from "../lib/svgmodel";
import { readExportRecord, type ExportRecord } from "../lib/upexport";

/** The full job-state union (design §9); the scan produces the first four. */
export type ExportState =
  | "discovered" | "interrupted" | "processed" | "partial"
  | "failed" | "cancelled" | "stale";

/** What the export folder of one pair holds, as the scan needs it. */
export interface ExportDirScan {
  /** Raw export.json text; null when the file is absent. */
  exportJson: string | null;
  /** Output file names present in export/ (e.g. ["icon.svg", "icon.jpg"]). */
  outputs: string[];
}

/** Reads one pair's export folder; exportio implements this over the FSA. */
export type ExportDirReader = (pairDirPath: string) => Promise<ExportDirScan>;

export interface UploadRowSource {
  /** Stable pair id — survives sort, filter and restart. */
  id: string;
  /** The pair's base name (the AI stem without `_AI`) — every output shares it. */
  iconBase: string;
  name: string;
  dirPath: string;
  metaPath: string;
  /** The chosen approved version number. */
  version: number;
  svgName: string;
  svgRelPath: string;
  /** size:mtime of the chosen SVG at scan time; null when the file is gone. */
  svgFingerprint: string | null;
  /** Row problems — reported, never a silent removal or substitution. */
  warnings: string[];
  exportState: ExportState;
  /** The committed record when a valid export.json was found. */
  record: ExportRecord | null;
}

export interface UploadDiscovery {
  rows: UploadRowSource[];
  /** Approved pairs with no approved generated SVG version: reported, never rows. */
  noApprovedSvg: { id: string; name: string }[];
  excluded: SourceExclusion[];
  unreadable: FileProblem[];
  /** Pair files that could not be parsed, by path. */
  corruptFiles: string[];
}

export async function discoverUploadRows(root: DirHandleLike, readExportDir: ExportDirReader): Promise<UploadDiscovery> {
  const discovery = await discoverApprovedSources(root, ["export"]);
  const byPath = new Map(discovery.entries.filter((e) => e.error === null).map((e) => [e.relPath, e]));
  const rows: UploadRowSource[] = [];
  const noApprovedSvg: { id: string; name: string }[] = [];
  for (const source of discovery.sources) {
    const meta = discovery.metas.get(source.id) ?? null;
    const chosen = chooseVersion(meta);
    if (chosen === null) {
      noApprovedSvg.push({ id: source.id, name: source.name });
      continue;
    }
    rows.push(await rowFor(source, chosen, byPath, readExportDir));
  }
  return {
    rows,
    noApprovedSvg,
    excluded: discovery.excluded,
    unreadable: discovery.unreadable,
    corruptFiles: discovery.corruptFiles,
  };
}

/**
 * The chosen version (design §4): the pair's `preferred` when that version is
 * approved, else the highest-numbered approved generated version.
 */
export function chooseVersion(meta: PairMeta | null): SvgVersion | null {
  if (meta === null) return null;
  const approved = meta.versions.filter((v) => v.status === "generated" && v.review === "approved");
  if (approved.length === 0) return null;
  const preferred = approved.find((v) => v.version === meta.preferred);
  return preferred ?? approved.reduce((hi, v) => (v.version > hi.version ? v : hi));
}

async function rowFor(
  source: { id: string; base: string; name: string; dirPath: string; metaPath: string },
  chosen: SvgVersion,
  byPath: Map<string, { size: number; mtime: number }>,
  readExportDir: ExportDirReader,
): Promise<UploadRowSource> {
  const file = byPath.get(chosen.svgPath) ?? null;
  const scan = await readExportDir(source.dirPath);
  const classified = classifyExport(scan);
  return {
    id: source.id,
    iconBase: source.base,
    name: source.name,
    dirPath: source.dirPath,
    metaPath: source.metaPath,
    version: chosen.version,
    svgName: baseName(chosen.svgPath),
    svgRelPath: chosen.svgPath,
    svgFingerprint: file === null ? null : `${file.size}:${file.mtime}`,
    warnings: file === null ? ["chosen-svg-missing"] : [],
    exportState: classified.state,
    record: classified.record,
  };
}

/**
 * Scan-time export state (design §9): a valid export.json supplies its own
 * committed state; outputs without a valid record are `interrupted` — restored
 * as needs-review, never auto-resumed; nothing at all is `discovered`.
 */
export function classifyExport(scan: ExportDirScan): { state: ExportState; record: ExportRecord | null } {
  if (scan.exportJson !== null) {
    const read = readExportRecord(scan.exportJson);
    if (read.ok) return { state: read.record.state, record: read.record };
  }
  if (scan.exportJson === null && scan.outputs.length === 0) return { state: "discovered", record: null };
  return { state: "interrupted", record: null };
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}
