// exporter.ts — one icon, one package, from the approved SVG to export.json.
// The stage list is the request's (§16) and the ORDER is dependency-driven: the
// metadata is generated once, the optimiser runs on the document that has no
// packet yet (so nothing can strip it), the accepted metadata is embedded and
// read back, and only then are the JPEG and the EPS rendered — from the exact
// bytes that were just written as <base>.svg. That is what makes
// "preview = SVG = JPEG = EPS" true rather than aspirational.
//
// Everything expensive is a seam (the metadata call, the raster, SVGO, the EPS
// converter), so the whole pipeline runs in tests with fakes and in the browser
// with the real ones. Nothing here writes outside the icon's own export folder,
// nothing here deletes, and a failure returns BEFORE the publish step — which is
// why every case in the failure table (§6) keeps the previous package.

import type { DirHandleLike } from "../lib/fs";
import { probePath } from "../lib/fs";
import {
  fingerprintSettings, type ExportRecord, type OutputFormat, type SettingsSnapshot, type SourceRef,
} from "../lib/svgupload/exportjson";
import type { EpsPlan } from "../lib/svgupload/eps";
import { planRegeneration, type RegenPlan } from "../lib/svgupload/states";
import type { MetaText } from "../lib/svgupload/mime";
import { validateMetadata, type MetaRecord } from "../lib/svgupload/metaprompt";
import { exportDirOf, packageNames, type PackageRead } from "./package";
import { metaText, widestStroke } from "./exportrecord";
import type { OptimizeOut } from "./optimizer";
import type { RasterArgs, RasterOut } from "./raster";
import { Run } from "./runstep";

/** Effective values the geometry, the raster and the record all read. */
export interface ExportValues {
  padding: { value: number; unit: "pt" | "px" | "%" };
  outputScale: number;
  background: string | null;
  stroke: { enabled: boolean; value: number; unit: "pt" | "px" };
  jpeg: { targetMp: number; quality: number; profile: string };
  optimizeSvg: boolean;
  includeEps: boolean;
  /** The configured EPS converter, or null — preflight depends on it (§13). */
  epsConverter: string | null;
}

export interface ExportItem {
  pair: SourceRef;
  /** The approved SVG's text, already read from the chosen version. */
  sourceText: string;
  settings: SettingsSnapshot;
  values: ExportValues;
  requested: Record<OutputFormat, boolean>;
  record: ExportRecord | null;
  present: PackageRead["present"];
  /** The accepted metadata already stored for this icon, when there is any. */
  meta: MetaRecord | null;
  /** False when the stored answer was made for an older source (§17). */
  metaFresh: boolean;
}

export interface ExportIo {
  root: DirHandleLike;
  /** Where the accepted metadata comes from (a fake transport in tests). */
  metadata: (item: ExportItem) => Promise<{ record: MetaRecord; meta: MetaText | null; error: string | null }>;
  raster: (args: RasterArgs) => Promise<RasterOut>;
  optimize: (code: string, enabled: boolean) => OptimizeOut;
  eps: (svg: string, plan: EpsPlan) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }>;
  /** The SVG an earlier run published, for a rebuild that only needs the files. */
  publishedSvg: (item: ExportItem) => Promise<string | null>;
  now: () => string;
}

export interface ExportOut {
  status: ExportRecord["status"];
  record: ExportRecord | null;
  /** The row's message: one sentence naming what happened, never a raw stack. */
  note: string;
  folderPath: string;
  /** True when nothing needed doing (§17: a skip is a success, not a failure). */
  skipped: boolean;
  meta: MetaRecord | null;
}

/** Runs the whole pipeline for one icon and publishes what survived. */
export async function exportIcon(item: ExportItem, io: ExportIo): Promise<ExportOut> {
  const plan = planOf(item);
  if (plan.action === "skip") {
    return { status: "processed", record: item.record, note: plan.reason, folderPath: exportDirOf(item.pair.dirPath), skipped: true, meta: item.meta };
  }
  return await new Run({ item, io, regen: plan, values: item.values }).execute();
}

function planOf(item: ExportItem): RegenPlan {
  return planRegeneration({
    record: item.record, present: item.present, requested: item.requested,
    sourceFingerprint: item.pair.fingerprint, settingsFingerprint: fingerprintSettings(item.settings),
    metadataReady: hasAcceptedMeta(item.meta), metadataFresh: item.metaFresh,
  });
}

/**
 * The last gate before any byte is written: the answer must be accepted AND still
 * pass the policy. The exporter is reachable from paths the row's own button does
 * not guard (a bulk retry, a future caller), and "invalid metadata can never
 * produce a processed export" must hold on every one of them.
 */
function hasAcceptedMeta(meta: MetaRecord | null): boolean {
  return meta !== null && meta.status === "accepted" && validateMetadata(meta).length === 0;
}

/** Reads the SVG an earlier run published, for a rebuild of a missing output. */
export async function readPublishedSvg(root: DirHandleLike, dirPath: string, base: string): Promise<string | null> {
  const dir = await probePath(root, exportDirOf(dirPath));
  if (dir === null) return null;
  try {
    const handle = await dir.getFileHandle(packageNames(base).svg);
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/**
 * Reads the JPEG an earlier run published (the preview dialog shows the FILE, so
 * what the user compares is the artifact, not a second render of it).
 */
export async function readPublishedJpeg(root: DirHandleLike, dirPath: string, base: string): Promise<Blob | null> {
  const dir = await probePath(root, exportDirOf(dirPath));
  if (dir === null) return null;
  try {
    const handle = await dir.getFileHandle(packageNames(base).jpg);
    return await handle.getFile();
  } catch {
    return null;
  }
}

export { fingerprintSettings, metaText, widestStroke };
