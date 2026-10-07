// jobartifacts.ts — the per-icon artifact decisions of the export job
// (design §6.4/§8/§9): optimizing the delivered SVG (RULE 9 — a failed
// verification or render-compare keeps the unoptimized copy), the JPEG
// segment surgery onto new or existing bytes, and building the committed
// export.json record. Pure functions over explicit inputs; job.ts owns the
// state machine that calls them.

import { META_POLICY_VERSION, type IconMetadata } from "../lib/upmeta";
import { endpointHostOf } from "../lib/gemconfig";
import type { GeminiUsage } from "../lib/geminireq";
import type { GeminiConfig } from "../lib/gemconfig";
import type { ExportSettings } from "../lib/upsettings";
import type { StagePlan } from "../lib/upfinger";
import { buildEps, epsPreflight } from "../lib/upeps";
import { validateMetadata } from "../lib/upmeta";
import { verifyMetadata } from "../lib/upverify";
import type { GeomScene } from "../lib/upgeom";
import type { RasterSize } from "../lib/upfit";
import { optimizeExportSvg, rendersMatch, SVGO_CONFIG_NAME, type PixelDeps } from "../lib/upsvgo";
import { embedJpegMetadata, jpegDimensions } from "../lib/upjpegmeta";
import { iptcIimRecord, xmpPacket } from "../lib/upmetaxml";
import { resolveBackground } from "../lib/svgbackground";
import { buildExportRecord, type ExportRecord, type MetadataProvenance, type OptimizerRecord } from "../lib/upexport";
import type { OutputFile } from "./exportio";
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
  /** SHA-256 of the source SVG's bytes (R02) — read once, by job.preflight. */
  sourceSha: string;
  /** The source file's byte length, as read at preflight. */
  sourceBytes: number;
  provenance: MetadataProvenance;
  /** The generation directory this commit publishes into. */
  generation: string;
  optimizer: OptimizerRecord | null;
  jpeg: { width: number; height: number; mpx: number; sha256: string; bytes: number };
  epsText: string | null;
  epsFailure: string | null;
  state: "processed" | "partial";
  now: string;
}

/**
 * The committed record: identity (root + pair + source content hash), effective
 * settings, accepted metadata with its generation-time provenance, what was
 * requested, and the exact final-byte description of every produced output
 * inside the generation directory this commit publishes.
 */
export async function buildJobRecord(a: RecordInputs): Promise<ExportRecord> {
  const base = a.req.row.iconBase;
  const dir = generationDir(a.req.row.dirPath, a.generation);
  const svgBytes = new TextEncoder().encode(a.finalSvg);
  const epsBytes = a.epsText === null ? null : new TextEncoder().encode(a.epsText);
  return buildExportRecord({
    pairId: a.req.row.id,
    iconBase: base,
    rootName: a.req.rootName,
    dirPath: a.req.row.dirPath,
    source: {
      relPath: a.req.row.svgRelPath, version: a.req.row.version,
      sha256: a.sourceSha, bytes: a.sourceBytes,
    },
    settings: a.req.settings,
    metadata: a.meta,
    provenance: a.provenance,
    requested: { svg: true, jpeg: true, eps: a.req.settings.includeEps },
    outputs: {
      svg: { relPath: `${dir}/${base}.svg`, bytes: svgBytes.length, sha256: a.svgSha, optimizer: a.optimizer },
      jpeg: { relPath: `${dir}/${base}.jpg`, bytes: a.jpeg.bytes, sha256: a.jpeg.sha256, width: a.jpeg.width, height: a.jpeg.height, mpx: a.jpeg.mpx, quality: a.req.settings.jpegQuality },
      eps: epsBytes === null ? null : { relPath: `${dir}/${base}.eps`, bytes: epsBytes.length, sha256: await a.deps.raster.sha256(epsBytes) },
    },
    generation: a.generation,
    state: a.state,
    failure: a.state === "partial" ? (a.epsFailure ?? "an EPS output was requested but not committed") : null,
    committedAt: a.now,
  });
}

/** `<pair>/export/generations/<gen>` — the one place that layout is written. */
export function generationDir(dirPath: string, generation: string): string {
  const prefix = dirPath === "" ? "" : `${dirPath}/`;
  return `${prefix}export/generations/${generation}`;
}

/** Matches no real print, so a pending generation plans an honest re-embed. */
export const PENDING_META: IconMetadata = { title: "\u2026pending generation", description: "\u2026pending generation", tags: ["pending-generation"] };

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Provenance for metadata a human accepted (no request was made for it). */
export function userProvenance(req: JobRequest, at: string): MetadataProvenance {
  return userProvenanceFor(req.prompt, req.gemini, at);
}

/** The same rule, for callers that hold the prompt and config but not a request. */
export function userProvenanceFor(prompt: string, gemini: GeminiConfig, at: string): MetadataProvenance {
  return {
    origin: "user", prompt, model: gemini.model,
    endpointHost: endpointHostOf(gemini.endpoint), requestId: null,
    inputTokens: null, outputTokens: null, estimatedCostUsd: null,
    generatedAt: at, policy: META_POLICY_VERSION,
  };
}

/** Provenance for an accepted answer, exactly as the provider reported it. */
export function aiProvenance(
  req: JobRequest, out: { usage: GeminiUsage; requestId: string | null }, at: string,
): MetadataProvenance {
  return {
    origin: "ai", prompt: req.prompt, model: req.gemini.model,
    endpointHost: endpointHostOf(req.gemini.endpoint), requestId: out.requestId,
    inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens,
    estimatedCostUsd: out.usage.estimatedCostUsd,
    generatedAt: at, policy: META_POLICY_VERSION,
  };
}

/** What the previous package holds, as the commit pass needs to know it. */
export interface PresentOutputs {
  svg: boolean;
  jpeg: boolean;
  eps: boolean;
}

/** The inputs the commit pass reads (R07/R12/R21 — one decision per output). */
export interface CommitInputs {
  plan: StagePlan | null;
  base: string;
  present: PresentOutputs;
  settings: ExportSettings;
  epsText: string | null;
  epsFailure: string | null;
}

/** The outputs this run (re)builds from memory, ready to be written. */
export function rebuiltOutputs(a: {
  plan: StagePlan | null; base: string; finalSvg: string; jpegBytes: Uint8Array | null; epsText: string | null;
}): OutputFile[] {
  const out: OutputFile[] = [];
  if (a.plan?.svg === "rebuild") out.push({ name: `${a.base}.svg`, bytes: encodeUtf8(a.finalSvg) });
  if (a.plan?.jpeg !== "keep" && a.jpegBytes !== null) out.push({ name: `${a.base}.jpg`, bytes: a.jpegBytes });
  if (a.epsText !== null) out.push({ name: `${a.base}.eps`, bytes: encodeUtf8(a.epsText) });
  return out;
}

/** The files this run keeps from the previous package (R07/R12). */
export function keptOutputs(a: CommitInputs): string[] {
  const keep: string[] = [];
  if (a.plan?.svg === "keep" && a.present.svg) keep.push(`${a.base}.svg`);
  if (a.plan?.jpeg === "keep" && a.present.jpeg) keep.push(`${a.base}.jpg`);
  if (epsCommitted(a) && a.epsText === null && a.present.eps) keep.push(`${a.base}.eps`);
  return keep;
}

/** EPS is committed when built now, kept from a valid package, or not wanted. */
export function epsCommitted(a: CommitInputs): boolean {
  if (a.epsText !== null) return true;
  if (a.epsFailure !== null) return false;
  if (!a.settings.includeEps) return true;
  return a.plan?.eps === "keep" && a.present.eps;
}

/** The EPS stage as a value: built text, or the reason it was skipped. */
export interface EpsOutcome {
  text: string | null;
  failure: string | null;
}

/**
 * EPS is optional by design (report §5): an unsupported scene or a failed
 * build yields a Partial package, never a failed export and never a wrong
 * vector — the JPEG and SVG still ship.
 */
export function epsOutcome(a: {
  scene: GeomScene; settings: ExportSettings; plan: StagePlan | null;
  exportSvg: string; raster: RasterSize; strokePt: number; title: string;
}): EpsOutcome {
  if (!a.settings.includeEps || a.plan?.eps !== "build") return { text: null, failure: null };
  const issues = epsPreflight(a.scene);
  if (issues.length > 0) return { text: null, failure: `EPS skipped (${issues.join(", ")})` };
  const out = buildEps({ svg: a.exportSvg, raster: a.raster, strokePt: a.strokePt, title: a.title });
  if (typeof out !== "string") return { text: null, failure: `EPS failed: ${out.error}` };
  return { text: out, failure: null };
}

/**
 * The export boundary (RULE 15, R06): the accepted metadata must pass the
 * CURRENT policy, both artifacts must read back field-for-field equal to it,
 * and the metadata must name where it came from. Nothing is written when this
 * objects.
 */
export function validateAccepted(a: {
  meta: IconMetadata; finalSvg: string; jpegBytes: Uint8Array; provenance: MetadataProvenance | null;
}): string | null {
  const issues = validateMetadata(a.meta);
  if (issues.length > 0) {
    return `the accepted metadata does not pass the current policy: ${issues.map((i) => `${i.field}: ${i.problem}`).join("; ")}`;
  }
  const verified = verifyMetadata(a.finalSvg, a.jpegBytes, a.meta);
  if (!verified.ok) return `metadata verification failed: ${verified.reasons.join("; ")}`;
  if (a.provenance === null) return "the accepted metadata has no recorded provenance";
  return null;
}
