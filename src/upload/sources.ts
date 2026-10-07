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
import { readExportRecord } from "../lib/upexportread";
import type { ExportRecord, MetadataProvenance } from "../lib/upexport";
import type { IconMetadata } from "../lib/upmeta";
import { completedBy, reconcile, recoveryWarning, settle, type JobJournal } from "../lib/upjournal";

/** The full job-state union (design §9); the scan produces the first four. */
export type ExportState =
  | "discovered" | "interrupted" | "processed" | "partial"
  | "failed" | "cancelled" | "stale";

/** What the export folder of one pair holds, as the scan needs it. */
export interface ExportDirScan {
  /** The committed record's text; null when no valid pointer/record is present. */
  exportJson: string | null;
  /** Output file names in the committed generation (e.g. ["icon.svg", "icon.jpg"]). */
  outputs: string[];
  /** The generation directory the pointer names; null when none exists. */
  generation: string | null;
  /** The folder still uses the pre-v2 layout (a single export.json). */
  legacy: boolean;
  /** A pointer exists but does not validate — reported, never guessed at. */
  corruptPointer: boolean;
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
  /**
   * SHA-256 of the chosen SVG's BYTES (R02/R03): the metadata cache and every
   * freshness question key on content, never on a path or a stat, so an
   * in-place edit with identical size and mtime still changes this identity.
   * Null when the file could not be read at scan time.
   */
  contentSha: string | null;
  /** Row problems — reported, never a silent removal or substitution. */
  warnings: string[];
  exportState: ExportState;
  /** The committed record when a valid export.json was found. */
  record: ExportRecord | null;
  /**
   * What the durable journal says about an unfinished run (report R10): the
   * sentence a user reads, and the accepted-metadata draft a re-export must
   * reuse instead of paying for the same answer twice. Never an auto-resume.
   */
  recovery: RowRecovery | null;
}

export interface RowRecovery {
  reason: string;
  /** The accepted metadata a crashed run left behind; null when none was reached. */
  draft: IconMetadata | null;
  /** Where that metadata came from — a recovered AI answer stays an AI answer. */
  provenance: MetadataProvenance | null;
}

/** The durable journal, as discovery needs it: read, then write the one update. */
export interface RecoveryReader {
  read(dirPath: string): Promise<JobJournal | null>;
  write(dirPath: string, journal: JobJournal): Promise<boolean>;
}

export type Clock = () => string;

/** Reads the chosen SVG's content hash; the browser adapter hashes the bytes. */
export type ShaReader = (relPath: string) => Promise<string | null>;

/** Everything discovery may need beyond the walk itself. */
export interface DiscoveryOpts {
  recovery?: RecoveryReader | null;
  now?: Clock;
  sourceSha?: ShaReader | null;
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

export async function discoverUploadRows(
  root: DirHandleLike, readExportDir: ExportDirReader, opts: DiscoveryOpts = {},
): Promise<UploadDiscovery> {
  const discovery = await discoverApprovedSources(root, ["export"]);
  const ctx: RecoveryCtx = {
    recovery: opts.recovery ?? null, now: opts.now ?? defaultClock, sourceSha: opts.sourceSha ?? null,
  };
  const io: RowIo = { byPath: new Map(discovery.entries.filter((e) => e.error === null).map((e) => [e.relPath, e])), readExportDir };
  const rows: UploadRowSource[] = [];
  const noApprovedSvg: { id: string; name: string }[] = [];
  for (const source of discovery.sources) {
    const meta = discovery.metas.get(source.id) ?? null;
    const chosen = chooseVersion(meta);
    if (chosen === null) {
      noApprovedSvg.push({ id: source.id, name: source.name });
      continue;
    }
    rows.push(await rowFor(source, chosen, io, ctx));
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

interface RecoveryCtx {
  recovery: RecoveryReader | null;
  now: Clock;
  sourceSha: ShaReader | null;
}

function defaultClock(): string {
  return new Date().toISOString();
}

/** The scan-time inputs one row is built from; one value, one parameter. */
interface RowIo {
  byPath: Map<string, { size: number; mtime: number }>;
  readExportDir: ExportDirReader;
}

async function rowFor(
  source: { id: string; base: string; name: string; dirPath: string; metaPath: string },
  chosen: SvgVersion,
  io: RowIo,
  ctx: RecoveryCtx,
): Promise<UploadRowSource> {
  const file = io.byPath.get(chosen.svgPath) ?? null;
  const scan = await io.readExportDir(source.dirPath);
  const classified = classifyExport(scan);
  const recovered = await recoverRow(ctx, source.dirPath, classified);
  const contentSha = ctx.sourceSha === null ? null : await ctx.sourceSha(chosen.svgPath);
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
    contentSha,
    warnings: [...(file === null ? ["chosen-svg-missing"] : []), ...recovered.warnings],
    exportState: recovered.state ?? classified.state,
    record: classified.record,
    recovery: recovered.info,
  };
}

/**
 * The restart pass (report R10): a durable journal that never settled means the
 * tab closed mid-run. It becomes `interrupted` EXACTLY once (the write is the
 * proof), the row turns into a needs-review state, and nothing is started —
 * the user decides whether to export again. A run that crashed after its own
 * commit is settled as processed, because the pointer already published it.
 */
async function recoverRow(
  ctx: RecoveryCtx, dirPath: string, classified: { state: ExportState; record: ExportRecord | null },
): Promise<{ state: ExportState | null; warnings: string[]; info: RowRecovery | null }> {
  if (ctx.recovery === null) return { state: null, warnings: [], info: null };
  const journal = await ctx.recovery.read(dirPath);
  if (journal === null) return { state: null, warnings: [], info: null };
  const committedAt = classified.record?.committedAt ?? null;
  if (completedBy(journal, committedAt)) {
    await ctx.recovery.write(dirPath, settle(journal, "processed", ctx.now()));
    return { state: null, warnings: [], info: null };
  }
  const reckoning = reconcile(journal, ctx.now());
  if (!reckoning.interrupted) {
    return { state: null, warnings: [], info: null };
  }
  await ctx.recovery.write(dirPath, reckoning.journal);
  const reason = reckoning.reason ?? recoveryWarning(reckoning.journal) ?? "interrupted";
  const draft = reckoning.journal.draft;
  return {
    state: "interrupted", warnings: [reason],
    info: { reason, draft: draft?.meta ?? null, provenance: draft?.provenance ?? null },
  };
}

/**
 * Scan-time export state (design §9): a valid pointer's record supplies its own
 * committed state; outputs without a valid record are `interrupted` — restored
 * as needs-review, never auto-resumed; nothing at all is `discovered`. A
 * pre-v2 folder is `stale`: its manifest was written by a schema whose hashes
 * describe a path, so it can only be re-exported, never reused (R24).
 */
export function classifyExport(scan: ExportDirScan): { state: ExportState; record: ExportRecord | null } {
  if (scan.exportJson !== null) {
    const read = readExportRecord(scan.exportJson);
    if (read.ok) return { state: read.record.state, record: read.record };
  }
  if (scan.legacy) return { state: "stale", record: null };
  // A pointer that does not validate is a visible problem, never "not exported":
  // the package may hold good bytes the user must review (R24/corrupt record).
  if (scan.corruptPointer) return { state: "interrupted", record: null };
  if (scan.exportJson === null && scan.outputs.length === 0) return { state: "discovered", record: null };
  return { state: "interrupted", record: null };
}

function baseName(relPath: string): string {
  return relPath.split("/").pop() ?? relPath;
}
