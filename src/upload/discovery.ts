// discovery.ts — approved-SVG discovery for the "SVG to upload" tab
// (design §3.2). Owns: the recursive walk (ignoring `export` so export
// outputs never feed discovery — no export loops), the pair sidecars, split
// scope, one row per pair with ≥1 valid approved SVG version, exclusions
// with reasons, and audit counts. The approval lives in the pair's own
// `.svg.json` (I-41); the export source is the NEWEST approved valid version.
// Pure orchestration over lib/scan + lib/pairmeta + lib/svgfile.

import { readDirTree, type DirHandleLike } from "../lib/fs";
import { compareNames, walkTree, type FileEntry } from "../lib/scan";
import { directoryNames, inSplitScope, scopeOf } from "../lib/splitscope";
import { parseAiName } from "../lib/naming";
import { pairId } from "../lib/pairing";
import { svgStem } from "../lib/svgfile";
import type { PairMeta } from "../lib/pairmeta";
import { loadMetaAt } from "../selection/pairstore";
import type { SvgVersion } from "../lib/svgmodel";

/** The export folder is never a discovery source (no export loops). */
export const EXPORT_IGNORE = ["export"];

/** One pair with an approved, valid, on-disk SVG — one row per pair. */
export interface UploadRowSource {
  id: string;
  base: string;
  suffix: string;
  dirPath: string;
  /** The export source: the newest approved valid version. */
  version: number;
  svgPath: string;
  svgName: string;
  /** size:mtime fingerprint of the SVG file, captured at scan time. */
  fingerprint: string;
  aiPath: string;
  metaPath: string;
  /** How many versions are approved + valid + on disk. */
  approvedValid: number;
}

export type UploadExclusionKind =
  | "no-approved-svg" | "no-valid-svg" | "no-sidecar" | "outside-split" | "duplicate";

/** A pair that is NOT listed, with the reason (reported, never a row). */
export interface UploadExclusion {
  id: string;
  relPath: string | null;
  kind: UploadExclusionKind;
  reason: string;
}

export interface UploadAudit {
  files: number;
  svgFiles: number;
  sidecars: number;
  pairs: number;
  rows: number;
  excluded: number;
  unreadable: number;
}

export interface UploadDiscovery {
  rows: UploadRowSource[];
  excluded: UploadExclusion[];
  audit: UploadAudit;
  /** Pair files that exist but could not be parsed, by relative path. */
  corruptFiles: string[];
  /** Files that could not be read (locked or being written). */
  unreadable: { relPath: string; reason: string }[];
}

/** Scans the root: every pair with a valid approved SVG, in deterministic order. */
export async function discoverUploadSources(root: DirHandleLike): Promise<UploadDiscovery> {
  const tree = await readDirTree(root, EXPORT_IGNORE);
  const entries = walkTree(tree, EXPORT_IGNORE);
  const rule = scopeOf(directoryNames(tree), root.name);
  const loaded = await loadSidecars(root, entries);
  const svgs = svgFilesOf(entries);
  const byStem = groupByStem(svgs);
  const collected = collectAll(loaded, byStem, rule.hideOutside);
  return {
    rows: sortRows(collected.rows),
    excluded: sortExclusions(collected.excluded),
    audit: auditOf(entries, svgs, { loaded, byStem, collected }),
    corruptFiles: loaded.filter((l) => l.corrupt).map((l) => l.path),
    unreadable: unreadableOf(entries),
  };
}

/** Every sidecar pair → a row or an exclusion; then the orphan SVG files. */
function collectAll(
  loaded: readonly LoadedSidecar[], byStem: Map<string, Map<number, SvgFile>>, hideOutside: boolean,
): { rows: UploadRowSource[]; excluded: UploadExclusion[] } {
  const rows: UploadRowSource[] = [];
  const excluded: UploadExclusion[] = [];
  const seen = new Set<string>();
  const ctx: PairCtx = { byStem, hideOutside, rows, excluded };
  for (const { meta, path, corrupt } of loaded) {
    if (corrupt) continue; // reported via corruptFiles, never guessed
    if (seen.has(meta.id)) {
      excluded.push({ id: meta.id, relPath: path, kind: "duplicate", reason: "a pair file for this pair was already read" });
      continue;
    }
    seen.add(meta.id);
    collectPair(meta, path, ctx);
  }
  collectOrphanSvgs(byStem, loaded, excluded);
  return { rows, excluded };
}

function auditOf(
  entries: readonly FileEntry[], svgs: readonly SvgFile[], ctx: { loaded: readonly LoadedSidecar[]; byStem: Map<string, Map<number, SvgFile>>; collected: { rows: UploadRowSource[]; excluded: UploadExclusion[] } },
): UploadAudit {
  return {
    files: entries.length,
    svgFiles: svgs.length,
    sidecars: ctx.loaded.length,
    pairs: ctx.loaded.length + countOrphans(ctx.byStem, ctx.loaded),
    rows: ctx.collected.rows.length,
    excluded: ctx.collected.excluded.length,
    unreadable: entries.filter((e) => e.error !== null).length,
  };
}

function unreadableOf(entries: readonly FileEntry[]): { relPath: string; reason: string }[] {
  return entries
    .filter((e) => e.error !== null)
    .map((e) => ({ relPath: e.relPath, reason: "unreadable" }))
    .sort((a, b) => compareNames(a.relPath, b.relPath));
}

interface LoadedSidecar { meta: PairMeta; path: string; corrupt: boolean }

/** Every `.svg.json` the walk found, read and rebased onto this root (I-49). */
async function loadSidecars(root: DirHandleLike, entries: readonly FileEntry[]): Promise<LoadedSidecar[]> {
  const out: LoadedSidecar[] = [];
  for (const e of entries) {
    if (!e.name.toLowerCase().endsWith(".svg.json")) continue;
    const read = await loadMetaAt(root, e.relPath);
    out.push({ meta: read.meta as PairMeta, path: e.relPath, corrupt: read.corrupt || read.meta === null });
  }
  return out;
}

interface SvgFile {
  name: string;
  relPath: string;
  dirPath: string;
  stem: string;
  version: number;
  size: number;
  mtime: number;
  error: string | null;
}

/** Versioned SVG files (`fog_AI.svg` = v1, `fog_AI_v2.svg` = v2). */
function svgFilesOf(entries: readonly FileEntry[]): SvgFile[] {
  return entries.flatMap((e) => {
    const parsed = parseSvgFileName(e.name);
    return parsed === null ? [] : [{ ...parsed, name: e.name, relPath: e.relPath, dirPath: e.dirPath, size: e.size, mtime: e.mtime, error: e.error }];
  });
}

function parseSvgFileName(name: string): { stem: string; version: number } | null {
  if (!name.toLowerCase().endsWith(".svg")) return null;
  const versioned = /^(.*)_v(\d+)\.svg$/i.exec(name);
  if (versioned !== null) return { stem: versioned[1], version: Number(versioned[2]) };
  return { stem: name.slice(0, -".svg".length), version: 1 };
}

/** `${dirPath}/${stem}` → version → file (canonical walk order is kept). */
function groupByStem(svgs: readonly SvgFile[]): Map<string, Map<number, SvgFile>> {
  const out = new Map<string, Map<number, SvgFile>>();
  for (const svg of svgs) {
    const key = `${svg.dirPath}/${svg.stem}`;
    const group = out.get(key) ?? new Map<number, SvgFile>();
    group.set(svg.version, svg);
    out.set(key, group);
  }
  return out;
}

/** The pair-collection context: shared maps plus the output lists. */
interface PairCtx {
  byStem: Map<string, Map<number, SvgFile>>;
  hideOutside: boolean;
  rows: UploadRowSource[];
  excluded: UploadExclusion[];
}

/** One sidecar pair: a row when it has an approved valid on-disk SVG. */
function collectPair(meta: PairMeta, path: string, ctx: PairCtx): void {
  if (ctx.hideOutside && !inSplitScope(meta.ai.relPath)) {
    ctx.excluded.push({ id: meta.id, relPath: meta.ai.relPath, kind: "outside-split", reason: "outside the split output scope" });
    return;
  }
  const group = ctx.byStem.get(`${meta.dirPath}/${svgStem(meta.ai.name)}`);
  const valid = approvedValid(meta.versions).filter((v) => fileFor(group, v.version) !== null);
  if (valid.length === 0) {
    excludeUnusable(meta, ctx.excluded);
    return;
  }
  const newest = valid.reduce((a, b) => (b.version > a.version ? b : a));
  const file = fileFor(group, newest.version) as SvgFile;
  ctx.rows.push({
    id: meta.id, base: meta.base, suffix: meta.suffix, dirPath: meta.dirPath,
    version: newest.version, svgPath: file.relPath, svgName: file.name,
    fingerprint: `${file.size}:${file.mtime}`,
    aiPath: meta.ai.relPath, metaPath: path, approvedValid: valid.length,
  });
}

/** No approved-and-valid SVG on disk: reported with the honest reason. */
function excludeUnusable(meta: PairMeta, excluded: UploadExclusion[]): void {
  const reviewed = meta.versions.filter((v) => v.review === "approved").length;
  excluded.push({
    id: meta.id, relPath: meta.ai.relPath,
    kind: reviewed === 0 ? "no-approved-svg" : "no-valid-svg",
    reason: reviewed === 0
      ? "no approved SVG version — approve one in Generate SVG first"
      : "the approved SVG version is not valid or missing on disk",
  });
}

/** The `${dir}/${stem}` key a sidecar path names (corrupt or not — the file exists). */
function sidecarStemKey(path: string): string {
  const at = path.lastIndexOf("/");
  const dir = at < 0 ? "" : path.slice(0, at);
  const file = path.slice(at + 1);
  return `${dir}/${file.slice(0, -".svg.json".length)}`;
}

/** SVG files whose AI stem has no pair file: unapproved, reported not listed. */
function collectOrphanSvgs(byStem: Map<string, Map<number, SvgFile>>, loaded: readonly LoadedSidecar[], excluded: UploadExclusion[]): void {
  const covered = new Set(loaded.map((l) => sidecarStemKey(l.path)));
  for (const [key, group] of [...byStem.entries()].sort((a, b) => compareNames(a[0], b[0]))) {
    if (covered.has(key)) continue;
    const stem = key.split("/").pop() ?? key;
    const parsed = parseAiName(`${stem}.png`);
    if (parsed === null) continue; // not an AI-named SVG: not a pair, just a file
    const anyFile = [...group.values()][0];
    excluded.push({
      id: pairId(anyFile.dirPath, parsed.base, parsed.suffix),
      relPath: anyFile.relPath,
      kind: "no-sidecar",
      reason: "no pair file — the approval lives in the pair's .svg.json",
    });
  }
}

function countOrphans(byStem: Map<string, Map<number, SvgFile>>, loaded: readonly LoadedSidecar[]): number {
  const covered = new Set(loaded.map((l) => sidecarStemKey(l.path)));
  let count = 0;
  for (const key of byStem.keys()) {
    if (covered.has(key)) continue;
    const stem = key.split("/").pop() ?? key;
    if (parseAiName(`${stem}.png`) !== null) count++;
  }
  return count;
}

/** Approved (review) + generated + validation-ok versions. */
function approvedValid(versions: readonly SvgVersion[]): SvgVersion[] {
  return versions.filter((v) => v.review === "approved" && v.status === "generated" && v.validation.ok);
}

function fileFor(group: Map<number, SvgFile> | undefined, version: number): SvgFile | null {
  const file = group?.get(version);
  return file === undefined || file.error !== null ? null : file;
}

function sortRows(rows: UploadRowSource[]): UploadRowSource[] {
  return [...rows].sort((a, b) => compareNames(a.svgPath, b.svgPath) || compareNames(a.id, b.id));
}

function sortExclusions(excluded: UploadExclusion[]): UploadExclusion[] {
  return [...excluded].sort((a, b) => compareNames(a.relPath ?? "", b.relPath ?? "") || compareNames(a.id, b.id));
}
