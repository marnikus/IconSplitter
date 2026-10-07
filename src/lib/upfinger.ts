// upfinger.ts — the selective re-export fingerprints and stage plan (design
// §9). Owns: what "the same icon" means for the committed record (source
// content, visual settings, metadata, raster quality, flags) and the ONE
// comparison that turns a committed record plus today's state into the minimal
// set of stages to re-run. Nothing stale is ever silently reused: every reuse
// decision names its reason.

import type { ExportRecord } from "./upexport";
import type { ExportSettings } from "./upsettings";
import type { IconMetadata } from "./upmeta";

export interface Fingerprints {
  source: string;
  visual: string;
  raster: string;
  metadata: string;
  flags: string;
}

/** Deterministic, explainable fingerprints (the v1 prefix keeps them namespaced). */
export function fingerprintsOf(a: { sourceSha: string; settings: ExportSettings; metadata: IconMetadata }): Fingerprints {
  const s = a.settings;
  return {
    source: `v1:${a.sourceSha}`,
    visual: `v1:${s.paddingPct}|${s.background.preset}|${s.background.custom}|${s.strokePt}|${s.artboard}`,
    raster: `v1:${s.jpegMpx}|${s.jpegQuality}`,
    metadata: `v1:${a.metadata.title}\u0000${a.metadata.description}\u0000${a.metadata.tags.join(",")}`,
    flags: `v1:${s.optimizeSvg}|${s.includeEps}`,
  };
}

export type MetadataPlan = "generate" | "reuse" | "reconfirm";
export type SvgPlan = "keep" | "rebuild";
export type JpegPlan = "keep" | "reembed" | "rebuild";
export type EpsPlan = "keep" | "build" | "skip";

export interface StagePlan {
  /** Rebuild the prepared export copy (geometry or metadata changed). */
  prepare: boolean;
  metadata: MetadataPlan;
  svg: SvgPlan;
  jpeg: JpegPlan;
  eps: EpsPlan;
  /** Every difference that drove the plan, human-readable. */
  reasons: string[];
}

export interface PlanArgs {
  record: ExportRecord | null;
  current: Fingerprints;
  /** Which output files exist in export/ right now. */
  outputs: { svg: boolean; jpeg: boolean; eps: boolean };
  includeEps: boolean;
}

/**
 * The minimal honest plan (design §9): source change → everything incl.
 * metadata reconfirmation; visual change → SVG/JPEG/EPS rebuild, metadata
 * kept but flagged; metadata-only → segments re-embedded, no AI call, no
 * raster; raster change → JPEG re-encode (and the EPS page); flag change →
 * only the affected output; missing output → rebuild only what is missing.
 */
export function planReexport(a: PlanArgs): StagePlan {
  if (a.record === null) {
    return {
      prepare: true, metadata: "generate", svg: "rebuild", jpeg: "rebuild",
      eps: a.includeEps ? "build" : "skip",
      reasons: ["no committed record — full export"],
    };
  }
  const d = diffsOf(a);
  const rebuildSvg = d.source || d.visual || d.metadata || d.optimize || !a.outputs.svg;
  return {
    prepare: rebuildSvg,
    metadata: d.source ? "reconfirm" : "reuse",
    svg: rebuildSvg ? "rebuild" : "keep",
    jpeg: jpegPlan(d, a),
    eps: epsPlan(d, a),
    reasons: d.reasons,
  };
}

interface Diffs {
  source: boolean;
  visual: boolean;
  metadata: boolean;
  raster: boolean;
  optimize: boolean;
  epsFlag: boolean;
  reasons: string[];
}

function diffsOf(a: PlanArgs): Diffs {
  const reasons: string[] = [];
  const record = a.record as NonNullable<PlanArgs["record"]>;
  const d: Diffs = {
    source: diff(a, "source", "the source SVG changed", reasons),
    visual: diff(a, "visual", "the visual settings changed", reasons),
    metadata: diff(a, "metadata", "the accepted metadata changed", reasons),
    raster: diff(a, "raster", "the raster size or quality changed", reasons),
    optimize: record.settings.optimizeSvg !== flagOf(a.current.flags, 0),
    epsFlag: record.settings.includeEps !== a.includeEps,
    reasons,
  };
  if (d.optimize) reasons.push("the optimize-SVG flag changed");
  if (d.epsFlag) reasons.push("the include-EPS flag changed");
  return d;
}

function jpegPlan(d: Diffs, a: PlanArgs): JpegPlan {
  const reembedOnly = d.metadata && !d.source && !d.visual && !d.raster && a.outputs.jpeg;
  if (reembedOnly) return "reembed";
  return d.source || d.visual || d.raster || !a.outputs.jpeg ? "rebuild" : "keep";
}

function epsPlan(d: Diffs, a: PlanArgs): EpsPlan {
  if (!a.includeEps) return "skip";
  return d.source || d.visual || d.raster || d.epsFlag || !a.outputs.eps ? "build" : "keep";
}

function flagOf(flags: string, part: number): boolean {
  const piece = flags.split("|")[part] ?? "";
  return piece.replace(/^v1:/, "") === "true";
}

function diff(a: PlanArgs, key: keyof Fingerprints, label: string, reasons: string[]): boolean {
  if (a.record === null) return false;
  const before = fingerprintsOf({
    sourceSha: a.record.source.sha256,
    settings: a.record.settings,
    metadata: a.record.metadata,
  })[key];
  const changed = before !== a.current[key];
  if (changed) reasons.push(label);
  return changed;
}
