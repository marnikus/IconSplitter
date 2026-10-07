// jobartifacts.ts — the per-icon artifact decisions of the export job
// (design §6.4/§8/§9): optimizing the delivered SVG (RULE 9 — a failed
// verification or render-compare keeps the unoptimized copy), the JPEG
// segment surgery onto new or existing bytes, and building the committed
// export.json record. Pure functions over explicit inputs; job.ts owns the
// state machine that calls them.

import { optimizeExportSvg, rendersMatch, SVGO_CONFIG_NAME, type PixelDeps } from "../lib/upsvgo";
import { embedJpegMetadata, jpegDimensions, readJpegMetadata } from "../lib/upjpegmeta";
import { iptcIimRecord, parseIptcIim, xmpPacket, xmpReadFields } from "../lib/upmetaxml";
import { resolveBackground } from "../lib/svgbackground";
import { buildExportRecord, type ExportRecord, type OptimizerRecord } from "../lib/upexport";
import { readSvgMetadata } from "../lib/upprepare";
import type { IconMetadata } from "../lib/upmeta";
import type { JobRequest, RunnerDeps } from "./runner";

/** Render-compare budget (design §6.4): small size, antialiasing tolerance. */
const COMPARE = { size: 256, tolerance: 32, budgetPct: 0.5 };

/** The delivered SVG: optimized only when verification AND render-compare pass. */
export async function optimizeForDelivery(
  embedded: string, req: JobRequest, deps: RunnerDeps,
): Promise<{ svg: string; optimizer: OptimizerRecord | null }> {
  if (!req.settings.optimizeSvg) return { svg: embedded, optimizer: null };
  const outcome = optimizeExportSvg(embedded);
  if (!outcome.optimized) return { svg: embedded, optimizer: null }; // RULE 9
  const same = await rendersMatch(embedded, outcome.svg, {
    width: COMPARE.size, height: COMPARE.size, background: resolveBackground(req.settings.background),
    tolerance: COMPARE.tolerance, budget: COMPARE.budgetPct, deps: deps.pixels as PixelDeps,
  });
  if (!same) return { svg: embedded, optimizer: null };
  return {
    svg: outcome.svg,
    optimizer: { version: outcome.version, config: SVGO_CONFIG_NAME, beforeBytes: outcome.beforeBytes, afterBytes: outcome.afterBytes },
  };
}

export interface JpegSegments {
  bytes: Uint8Array;
  stats: { width: number; height: number; mpx: number; sha256: string; bytes: number };
}

/** XMP + IPTC into the JPEG bytes; null when the 65 502-byte limit is exceeded. */
export async function embedJpegSegments(
  jpeg: Uint8Array, meta: IconMetadata, deps: Pick<RunnerDeps, "raster">,
): Promise<JpegSegments | null> {
  const bytes = embedJpegMetadata(jpeg, { xmp: xmpPacket(meta), iptc: iptcIimRecord(meta) });
  if (bytes === null) return null;
  const dims = jpegDimensions(bytes);
  return {
    bytes,
    stats: dims === null
      ? { width: 0, height: 0, mpx: 0, sha256: "", bytes: bytes.length }
      : { width: dims.width, height: dims.height, mpx: (dims.width * dims.height) / 1e6, sha256: await deps.raster.sha256(bytes), bytes: bytes.length },
  };
}

export interface RecordInputs {
  req: JobRequest;
  deps: RunnerDeps;
  meta: IconMetadata;
  finalSvg: string;
  svgSha: string;
  sourceSha: string;
  optimizer: OptimizerRecord | null;
  jpeg: { width: number; height: number; mpx: number; sha256: string; bytes: number };
  epsText: string | null;
  epsFailure: string | null;
  committedEps: ExportRecord["outputs"]["eps"];
  state: "processed" | "partial";
  now: string;
}

export function validateArtifacts(
  finalSvg: string, jpegBytes: Uint8Array, meta: IconMetadata,
): string | null {
  const svgBack = readSvgMetadata(finalSvg);
  if (!svgMatches(svgBack, meta)) return "the embedded SVG metadata does not read back equal to the accepted metadata";
  const jpegBack = readJpegMetadata(jpegBytes);
  if (jpegBack.xmp === null || jpegBack.iptc === null) return "the embedded JPEG metadata does not read back";
  if (!xmpMatches(jpegBack.xmp, meta)) return "the embedded JPEG XMP does not read back equal to the accepted metadata";
  if (!iptcMatches(jpegBack.iptc, meta)) return "the embedded JPEG IPTC does not read back equal to the accepted metadata";
  return null;
}

function svgMatches(back: ReturnType<typeof readSvgMetadata>, meta: IconMetadata): boolean {
  return back !== null && back.title === meta.title && back.description === meta.description
    && back.tags.join("\0") === meta.tags.join("\0");
}

function xmpMatches(packet: string, meta: IconMetadata): boolean {
  const f = xmpReadFields(packet);
  return f !== null && f.title === meta.title && f.description === meta.description && f.subject.join("\0") === meta.tags.join("\0");
}

function iptcMatches(iptc: Uint8Array, meta: IconMetadata): boolean {
  const f = parseIptcIim(iptc);
  return f.title === meta.title && f.description === meta.description && f.keywords.join("\0") === meta.tags.join("\0");
}

/** The committed record: identity, effective settings, accepted metadata, outputs. */
export async function buildJobRecord(a: RecordInputs): Promise<ExportRecord> {
  const base = a.req.row.iconBase;
  const dir = a.req.row.dirPath;
  const epsOut = a.epsText !== null
    ? { relPath: `${dir}/export/${base}.eps`, bytes: new TextEncoder().encode(a.epsText).length }
    : a.committedEps ?? null;
  return buildExportRecord({
    pairId: a.req.row.id,
    iconBase: base,
    source: { relPath: a.req.row.svgRelPath, version: a.req.row.version, sha256: a.sourceSha },
    settings: a.req.settings,
    metadata: a.meta,
    outputs: {
      svg: { relPath: `${dir}/export/${base}.svg`, bytes: new TextEncoder().encode(a.finalSvg).length, sha256: a.svgSha, optimizer: a.optimizer },
      jpeg: { relPath: `${dir}/export/${base}.jpg`, bytes: a.jpeg.bytes, sha256: a.jpeg.sha256, width: a.jpeg.width, height: a.jpeg.height, mpx: a.jpeg.mpx, quality: a.req.settings.jpegQuality },
      eps: epsOut,
    },
    state: a.state,
    failure: a.state === "partial" ? (a.epsFailure ?? "an EPS output was requested but not committed") : null,
    committedAt: a.now,
  });
}
