// rows.ts — one row per APPROVED icon, showing its chosen SVG (design §2/§5).
// Why it exists: the Generate SVG tab lists sources with their AI reference;
// this tab prepares the vector for upload, so its row must be the SVG itself —
// the version the user preferred (I-54), named after the icon base every output
// will share. Everything the row cannot do is a VISIBLE reason: a pair with no
// usable version is blocked with the fix spelled out, a missing source keeps its
// row and says so, and an export output can never be discovered as a source
// (otherwise exporting could feed exporting).

import { chosenVersion } from "../svgfile";
import type { SvgVersion } from "../svgmodel";
import type { PairMeta } from "../pairmeta";
import { PROBLEM_LABEL, type ProblemKind } from "../pairing";
import { compareNames } from "../scan";
import { SVG_EXT } from "../svgmodel";

/** The part of `SvgSource` this tab reads — structurally compatible with it. */
export interface UploadSourceInput {
  id: string;
  name: string;
  relPath: string;
  dirPath: string;
  metaPath: string;
  problems: readonly { kind: ProblemKind; relPath: string | null; reason: string }[];
}

/** What the package reader found for this icon (phase G owns the real reader). */
export interface UploadExportState {
  status: "processed" | "partial" | "failed" | "stale";
  at: string;
  note: string;
}

export interface UploadRowInput {
  source: UploadSourceInput;
  meta: PairMeta | null;
  /** The job state the queue last reported for this icon (default: queued). */
  job?: JobKind;
  /** The metadata state for the CHOSEN version (see lib/svgupload/meta). */
  metaState?: MetaKind;
  /** Is this path in the scanned file set? Absent = the scan did not check. */
  exists?: (relPath: string) => boolean;
  /** size:mtime of the chosen SVG, from the scan; "" when unknown. */
  fingerprintOf?: (relPath: string) => string;
  /** The package this icon already has, or null when none was read. */
  exportState?: UploadExportState | null;
}

/** The job states a row can be in (mirrors jobctl's JobState). */
export type JobKind = "queued" | "running" | "processed" | "partial" | "failed" | "cancelled" | "interrupted";
/** What the metadata field holds for this icon right now. */
export type MetaKind = "none" | "accepted" | "stale" | "rejected" | "interrupted";

export interface UploadRow {
  id: string;
  name: string;
  dirPath: string;
  /** `<pair folder>/export/<exportBase>.{svg,jpg,eps}` — one base, every format. */
  exportBase: string;
  /** The chosen version's file, or null when nothing usable exists. */
  svgPath: string | null;
  version: number | null;
  versionLabel: string;
  /** size:mtime of the chosen SVG at scan time; "" when the scan could not say. */
  fingerprint: string;
  metaPath: string;
  /** Visible reasons, never a silent skip. */
  warnings: string[];
  /** Non-null: the row cannot be exported until this is fixed. */
  blocked: string | null;
  exportState: UploadExportState | null;
  job: JobKind;
  metaState: MetaKind;
}

export const NO_SVG_REASON = "No usable SVG version — regenerate in Generate SVG";
export const MISSING_SVG_REASON = "The chosen SVG is not on disk — rescan or regenerate";

/** True for any file inside a folder named `export` — our own outputs. */
export function isExportOutput(relPath: string): boolean {
  return relPath.split("/").includes("export");
}

/** "icon-trophy_AI_7_04_v2.svg" -> "icon-trophy_AI_7_04" (every format shares it). */
export function exportBaseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = fileName.endsWith(SVG_EXT) || dot > 0 ? fileName.slice(0, dot) : fileName;
  return stem.replace(/_v\d+$/, "");
}

/** Builds the rows the tab lists, in path order (a rescan repeats exactly). */
export function buildUploadRows(inputs: readonly UploadRowInput[]): UploadRow[] {
  return inputs
    .filter((i) => !isExportOutput(i.source.relPath))
    .map(buildUploadRow)
    .sort((a, b) => compareNames(a.dirPath, b.dirPath) || compareNames(a.id, b.id));
}

export function buildUploadRow(input: UploadRowInput): UploadRow {
  const ctx = contextOf(input);
  return {
    ...identityOf(input.source, ctx),
    ...chosenFields(ctx, input.fingerprintOf),
    id: input.source.id,
    warnings: warningsOf(input, ctx.chosen, ctx.missing),
    blocked: blockedReason(ctx.chosen === null, ctx.missing),
    exportState: input.exportState ?? null,
    job: input.job ?? "queued",
    metaState: input.metaState ?? "none",
  };
}

interface RowContext {
  chosen: SvgVersion | null;
  version: number | null;
  preferred: number | null;
  missing: boolean;
}

/** Everything the row derives from the pair file + the scan, read once. */
function contextOf(input: UploadRowInput): RowContext {
  const versions = input.meta?.versions ?? [];
  const preferred = input.meta?.preferred ?? null;
  const chosen = chosenVersion(versions, preferred);
  return { chosen, version: chosen?.version ?? null, preferred, missing: isMissing(chosen, input.exists) };
}

/** Who the icon is — taken from the source, never invented. */
function identityOf(source: UploadSourceInput, ctx: RowContext): Pick<UploadRow, "id" | "name" | "dirPath" | "exportBase" | "metaPath" | "version"> {
  return {
    id: source.id, name: source.name, dirPath: source.dirPath,
    exportBase: exportBaseName(source.name), metaPath: source.metaPath, version: ctx.version,
  };
}

/** The chosen file and how the row labels it. */
function chosenFields(ctx: RowContext, stat: ((rel: string) => string) | undefined): Pick<UploadRow, "svgPath" | "versionLabel" | "fingerprint"> {
  return {
    svgPath: ctx.chosen?.svgPath ?? null,
    versionLabel: versionLabel(ctx.version, ctx.preferred),
    fingerprint: fingerprintOf(ctx.chosen, stat),
  };
}

/** size:mtime of the chosen file, "" when the scan could not say. */
function fingerprintOf(chosen: SvgVersion | null, stat: ((rel: string) => string) | undefined): string {
  if (chosen === null || stat === undefined) return "";
  return stat(chosen.svgPath);
}

/** Is the chosen file absent from the scanned set? (No predicate = not checked.) */
function isMissing(chosen: SvgVersion | null, exists: ((rel: string) => boolean) | undefined): boolean {
  return chosen !== null && exists !== undefined && !exists(chosen.svgPath);
}

/** Every visible reason the row has: the scan's problems plus its own checks. */
function warningsOf(input: UploadRowInput, chosen: SvgVersion | null, missing: boolean): string[] {
  const out = input.source.problems.map((p) => PROBLEM_LABEL[p.kind]);
  const lastError = (input.meta?.versions ?? []).filter((v) => v.error).at(-1)?.error ?? null;
  if (lastError !== null) out.push(lastError);
  if (missing && chosen !== null) out.push(`${chosen.svgPath} is not found in the scanned folder`);
  return out;
}

function blockedReason(noVersion: boolean, missing: boolean): string | null {
  if (noVersion) return NO_SVG_REASON;
  return missing ? MISSING_SVG_REASON : null;
}

/** True when this row may send work: nothing blocks it and it has a source. */
export function isEligible(row: UploadRow): boolean {
  return row.blocked === null && row.svgPath !== null;
}

/** Ready to export: eligible AND holding accepted metadata for the source. */
export function isReady(row: UploadRow): boolean {
  return isEligible(row) && row.metaState === "accepted";
}

/** The row's visible state word — one place, so two rows cannot disagree. */
export function uploadRowState(row: UploadRow): { tone: "ok" | "warn" | "bad" | "busy" | "idle"; label: string } {
  if (row.blocked !== null) return { tone: "bad", label: "Blocked" };
  if (row.job === "running") return { tone: "busy", label: "Processing" };
  if (row.job === "queued") return { tone: "idle", label: "Queued" };
  if (row.job === "processed") return { tone: "ok", label: "Processed" };
  if (row.job === "partial") return { tone: "warn", label: "Partial" };
  if (row.job === "interrupted") return { tone: "warn", label: "Interrupted — needs review" };
  if (row.job === "cancelled") return { tone: "idle", label: "Cancelled" };
  return { tone: "bad", label: "Failed" };
}

/** Stale covers both halves of the promise: the package and the metadata (§17). */
export function isStale(row: UploadRow): boolean {
  return row.exportState?.status === "stale" || row.job === "interrupted" || row.metaState === "stale";
}

function versionLabel(version: number | null, preferred: number | null): string {
  if (version === null) return "—";
  return version === preferred ? `v${version} (preferred)` : `v${version}`;
}
