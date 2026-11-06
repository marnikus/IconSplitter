// discovery.ts — strict exported-only discovery for the "Upload" tab.
// Rule: ONLY directories named "export" are inspected, and ONLY files that are
// both recorded as exported outputs in that folder's `export.json` AND present
// inside that `export` folder on disk are included.
// 2026-11-06: an export is also hidden when its source item's pair file is
// found under the folder and is no longer approved in Generate SVG (Remove in
// SVG to upload / Upload declines it there). The pair-file reader is injected
// (`sourcePairs`) — this module stays pure.

import { readDirTree, readTextAt, type DirHandleLike } from "../fs";
import { isRecord } from "../isrecord";
import { compareNames, walkTree, type FileEntry } from "../scan";
import { parseExportRecord, stemOf, type ExportRecord } from "../upload/export";
import type { ExportedFileRef, ExportedFiles, ExportedItem } from "./types";

export interface StockDiscoveryAudit {
  exportFolders: number;
  items: number;
  uncommittedRecords: number;
  unrecordedFiles: number;
  missingRecordedFiles: number;
  duplicateIds: number;
  /** Exports hidden because their source item is no longer approved. */
  declinedSources: number;
}

/** A pair file found by the walk: the item's id, its path, and whether it is approved. */
export interface SourcePair { id: string; metaPath: string; approved: boolean }

/** Reads the walk's pair files; keyed by `sourcePairKey`. */
export type SourcePairLookup = (root: DirHandleLike, entries: readonly FileEntry[]) => Promise<Map<string, SourcePair>>;

export interface StockDiscoveryOptions {
  sourcePairs?: SourcePairLookup;
}

/** One key for a pair, from its folder (relative to the scanned root), base and suffix. */
export function sourcePairKey(dir: string, base: string, suffix: string): string {
  return `${dir}
${base}
${suffix}`;
}

/** The folder holding the pair an export folder belongs to; null = above the scanned root. */
function pairDirOf(exportDir: string): string | null {
  if (exportDir === "") return null;
  const at = exportDir.lastIndexOf("/");
  return at < 0 ? "" : exportDir.slice(0, at);
}

export interface StockDiscovery {
  items: ExportedItem[];
  corruptRecords: string[];
  unreadable: string[];
  audit: StockDiscoveryAudit;
}

interface ExportFolderBucket {
  exportDir: string;
  entries: Map<string, FileEntry>;
}

function isExportDir(dirPath: string, rootName: string): boolean {
  if (dirPath === "") return rootName.toLowerCase() === "export";
  const last = dirPath.slice(dirPath.lastIndexOf("/") + 1);
  return last.toLowerCase() === "export";
}

function groupExportDirs(entries: readonly FileEntry[], rootName: string): ExportFolderBucket[] {
  const map = new Map<string, Map<string, FileEntry>>();
  for (const entry of entries) {
    if (!isExportDir(entry.dirPath, rootName)) continue;
    const bucket = map.get(entry.dirPath) ?? new Map<string, FileEntry>();
    bucket.set(entry.name, entry);
    map.set(entry.dirPath, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => compareNames(a[0], b[0]))
    .map(([exportDir, mapEntries]) => ({ exportDir, entries: mapEntries }));
}

function safeRecordedFileName(rawOut: unknown): string | null {
  if (!isRecord(rawOut) || typeof rawOut.path !== "string") return null;
  const parts = rawOut.path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) return null;
  const fileName = parts[parts.length - 1];
  const parent = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : "export";
  return parent === "export" ? fileName : null;
}

function extOfFile(name: string): ExportedFileRef["ext"] | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".svg")) return "svg";
  if (lower.endsWith(".eps")) return "eps";
  return lower.endsWith(".zip") ? "zip" : null;
}

function resolveSlot(
  bucket: ExportFolderBucket,
  rawOut: unknown,
  claimed: Set<string>,
  missing: string[],
): ExportedFileRef | null {
  const fileName = safeRecordedFileName(rawOut);
  if (fileName === null) return null;
  claimed.add(fileName);
  const ext = extOfFile(fileName);
  const entry = bucket.entries.get(fileName);
  if (!entry || entry.error !== null || entry.size <= 0 || ext === null) {
    missing.push(fileName);
    return null;
  }
  return { relPath: entry.relPath, fileName: entry.name, bytes: entry.size, mtime: entry.mtime, ext };
}

function resolveOutputs(bucket: ExportFolderBucket, record: ExportRecord): {
  files: ExportedFiles;
  claimed: Set<string>;
  missing: string[];
} {
  const outs = record.outputs as unknown as Record<string, unknown>;
  const claimed = new Set<string>(["export.json"]);
  const missing: string[] = [];
  const jpg = resolveSlot(bucket, outs.jpg, claimed, missing);
  const png = jpg === null ? resolveSlot(bucket, outs.png, claimed, missing) : null;
  const svg = resolveSlot(bucket, outs.svg, claimed, missing);
  const eps = resolveSlot(bucket, outs.eps, claimed, missing);
  const zip = resolveSlot(bucket, outs.zip, claimed, missing);
  return { files: { raster: jpg ?? png, svg, eps, zip }, claimed, missing };
}

function countUnrecorded(bucket: ExportFolderBucket, claimed: ReadonlySet<string>): number {
  let count = 0;
  for (const name of bucket.entries.keys()) {
    if (!claimed.has(name) && !name.endsWith(".tmp")) count += 1;
  }
  return count;
}

function hasAnyFile(files: ExportedFiles): boolean {
  return files.raster !== null || files.svg !== null || files.eps !== null || files.zip !== null;
}

function stemFromItem(record: ExportRecord, files: ExportedFiles): string {
  const first = files.raster ?? files.svg ?? files.eps ?? files.zip;
  if (first !== null) return first.fileName.replace(/\.[^.]+$/, "");
  const srcName = record.source.svgPath.slice(record.source.svgPath.lastIndexOf("/") + 1);
  return stemOf(srcName || record.pair.base);
}

function isCommittedExport(record: ExportRecord): boolean {
  return record.timestamps.committedAt !== null;
}

async function readFolderRecord(
  root: DirHandleLike,
  bucket: ExportFolderBucket,
): Promise<{ kind: "ok"; record: ExportRecord; recordPath: string } | { kind: "corrupt" | "unreadable"; path: string } | { kind: "none" }> {
  const jsonEntry = bucket.entries.get("export.json");
  if (!jsonEntry) return { kind: "none" };
  if (jsonEntry.error !== null) return { kind: "unreadable", path: jsonEntry.relPath };
  const text = await readTextAt(root, jsonEntry.relPath);
  if (text === null) return { kind: "unreadable", path: jsonEntry.relPath };
  try {
    const parsed = parseExportRecord(JSON.parse(text));
    return parsed === null
      ? { kind: "corrupt", path: jsonEntry.relPath }
      : { kind: "ok", record: parsed, recordPath: jsonEntry.relPath };
  } catch {
    return { kind: "corrupt", path: jsonEntry.relPath };
  }
}

export async function discoverExportedItems(root: DirHandleLike, opts: StockDiscoveryOptions = {}): Promise<StockDiscovery> {
  const tree = await readDirTree(root, []);
  const entries = walkTree(tree, []);
  const buckets = groupExportDirs(entries, root.name);
  const pairs = opts.sourcePairs ? await opts.sourcePairs(root, entries) : null;
  const items: ExportedItem[] = [];
  const corruptRecords: string[] = [];
  const unreadable: string[] = [];
  const seenIds = new Set<string>();
  const audit: StockDiscoveryAudit = {
    exportFolders: buckets.length, items: 0, uncommittedRecords: 0,
    unrecordedFiles: 0, missingRecordedFiles: 0, duplicateIds: 0, declinedSources: 0,
  };

  for (const bucket of buckets) {
    await collectBucket(root, bucket, { items, corruptRecords, unreadable, seenIds, audit, pairs });
  }
  items.sort((a, b) => compareNames(a.recordPath, b.recordPath) || compareNames(a.id, b.id));
  audit.items = items.length;
  return { items, corruptRecords, unreadable, audit };
}

interface CollectState {
  items: ExportedItem[];
  corruptRecords: string[];
  unreadable: string[];
  seenIds: Set<string>;
  audit: StockDiscoveryAudit;
  /** null = the scan did not look for source pairs. */
  pairs: Map<string, SourcePair> | null;
}

/** The export's source pair, when the scan looked and found it. */
function sourceOf(st: CollectState, bucket: ExportFolderBucket, record: ExportRecord): SourcePair | null {
  const dir = pairDirOf(bucket.exportDir);
  if (st.pairs === null || dir === null) return null;
  return st.pairs.get(sourcePairKey(dir, record.pair.base, record.pair.suffix)) ?? null;
}

/** A folder whose export.json could not be used: counted or named, never guessed. */
function noteUnusable(bucket: ExportFolderBucket, loaded: { kind: "corrupt" | "unreadable"; path: string } | { kind: "none" }, st: CollectState): void {
  if (loaded.kind === "none") st.audit.unrecordedFiles += countUnrecorded(bucket, new Set());
  else if (loaded.kind === "unreadable") st.unreadable.push(loaded.path);
  else st.corruptRecords.push(loaded.path);
}

/** Why a readable record is not listed (counted in the audit), or false when it may be. */
function skipRecord(st: CollectState, record: ExportRecord, source: SourcePair | null): boolean {
  if (!isCommittedExport(record)) { st.audit.uncommittedRecords += 1; return true; }
  if (st.seenIds.has(record.pair.id)) { st.audit.duplicateIds += 1; return true; }
  if (source !== null && !source.approved) { st.audit.declinedSources += 1; return true; }
  return false;
}

async function collectBucket(root: DirHandleLike, bucket: ExportFolderBucket, st: CollectState): Promise<void> {
  const loaded = await readFolderRecord(root, bucket);
  if (loaded.kind !== "ok") { noteUnusable(bucket, loaded, st); return; }
  const source = sourceOf(st, bucket, loaded.record);
  if (skipRecord(st, loaded.record, source)) return;

  const resolved = resolveOutputs(bucket, loaded.record);
  st.audit.unrecordedFiles += countUnrecorded(bucket, resolved.claimed);
  st.audit.missingRecordedFiles += resolved.missing.length;
  if (!hasAnyFile(resolved.files)) return;

  st.seenIds.add(loaded.record.pair.id);
  st.items.push({
    id: loaded.record.pair.id,
    stem: stemFromItem(loaded.record, resolved.files),
    exportDir: bucket.exportDir,
    recordPath: loaded.recordPath,
    record: loaded.record,
    files: resolved.files,
    missingRecorded: resolved.missing,
    ...(st.pairs === null ? {} : { source: source === null ? null : { id: source.id, metaPath: source.metaPath } }),
  });
}
