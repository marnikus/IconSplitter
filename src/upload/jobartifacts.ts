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

const sameList = (a: string[], b: string[]): boolean => a.join("\u0000") === b.join("\u0000");

/** R06: the embedded JPEG metadata must read back field-equal to the accepted
 * metadata (both XMP and IPTC), not merely be present. */
export function jpegMetadataMatches(jpeg: Uint8Array, meta: IconMetadata): boolean {
  const back = readJpegMetadata(jpeg);
  if (back.xmp === null || back.iptc === null) return false;
  const xmp = xmpReadFields(back.xmp);
  const iim = parseIptcIim(back.iptc);
  if (xmp === null) return false;
  const xmpOk = xmp.title === meta.title && xmp.description === meta.description && sameList(xmp.subject, meta.tags);
  const iimOk = iim.title === meta.title && iim.description === meta.description && sameList(iim.keywords, meta.tags);
  return xmpOk && iimOk;
}

export interface RecordInputs {
  req: JobRequest;
  deps: RunnerDeps;
  meta: IconMetadata;
  /** SHA-256 of the source SVG's bytes (R02) — never the file path. */
  sourceSha: string;
  finalSvg: string;
  svgSha: string;
  optimizer: OptimizerRecord | null;
  jpeg: { width: number; height: number; mpx: number; sha256: string; bytes: number };
  epsText: string | null;
  epsFailure: string | null;
  state: "processed" | "partial";
  now: string;
}

/** The committed record: identity, effective settings, accepted metadata, outputs. */
export async function buildJobRecord(a: RecordInputs): Promise<ExportRecord> {
  const base = a.req.row.iconBase;
  const dir = a.req.row.dirPath;
  return buildExportRecord({
    pairId: a.req.row.id,
    iconBase: base,
    source: { relPath: a.req.row.svgRelPath, version: a.req.row.version, sha256: a.sourceSha },
    settings: a.req.settings,
    metadata: a.meta,
    outputs: {
      svg: { relPath: `${dir}/export/${base}.svg`, bytes: new TextEncoder().encode(a.finalSvg).length, sha256: a.svgSha, optimizer: a.optimizer },
      jpeg: { relPath: `${dir}/export/${base}.jpg`, bytes: a.jpeg.bytes, sha256: a.jpeg.sha256, width: a.jpeg.width, height: a.jpeg.height, mpx: a.jpeg.mpx, quality: a.req.settings.jpegQuality },
      eps: a.epsText === null ? null : { relPath: `${dir}/export/${base}.eps`, bytes: new TextEncoder().encode(a.epsText).length },
    },
    state: a.state,
    failure: a.state === "partial" ? (a.epsFailure ?? "an EPS output was requested but not committed") : null,
    committedAt: a.now,
  });
}
