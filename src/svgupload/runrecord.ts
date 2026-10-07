// runrecord.ts — what an export run RECORDS (merge report §2/§7 Phase 2: root,
// pair, source version and content hash, effective settings and origin,
// generation-time prompt/provider/model/usage, requested versus produced formats
// and the exact final-byte output records). Split from runstep.ts for size, and
// because building the record and validating it are one subject: the run step
// performs work, this module states what the work amounted to.

import { boundsOfDocument, planExport, type ExportPlan } from "../lib/svgupload/prepare";
import { latin, metadataRecord, outputRecords, text, widestStroke } from "./exportrecord";
import { EXPORT_SCHEMA, fingerprintSettings, hashText, type ExportRecord, type OutputRecord, type StageRecord, type ToolRecord } from "../lib/svgupload/exportjson";
import { PX_PER_INCH, pxToPt } from "../lib/svgupload/units";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import type { EpsRequest } from "../lib/svgupload/epswrite";
import type { ExportItem } from "./exporter";

/** What a run worked on. `performed` is asked per output, so "kept" is visible. */
export interface Performed {
  jpg: boolean;
  eps: boolean;
}

/** Everything the record and the validation read, assembled by the run step. */
export interface RunState {
  item: ExportItem;
  plan: ExportPlan;
  stages: StageRecord[];
  tools: ToolRecord[];
  performed: Performed;
  svgText: string;
  jpeg: Uint8Array | null;
  epsBytes: Uint8Array | null;
  /** The EPS an earlier package holds: it stays part of the package. */
  keptEps: OutputRecord | null;
  /** The answer this run received, when it received one. */
  meta: MetaRecord | null;
  warnings: string[];
  at: string;
}

/** The numbers the raster, the EPS writer and the record all read. */
export function exportPlan(item: ExportItem): ExportPlan {
  return planExport({
    bounds: boundsOfDocument(item.sourceText), padding: item.values.padding,
    outputScale: item.values.outputScale, stroke: item.values.stroke,
    documentStrokePx: widestStroke(item.sourceText), background: item.values.background,
  });
}

/** The artboard and stroke override, as the EPS writer must see them (§9). */
export function epsRequestOf(plan: ExportPlan): EpsRequest {
  return {
    artboard: plan.artboard,
    stroke: plan.stroke.applied ? { width: plan.stroke.docWidth, pt: pxToPt(plan.stroke.targetPx) } : null,
  };
}

/** The record as far as it is known before validation (§5). */
export function recordFor(s: RunState): ExportRecord {
  const previous = s.item.record;
  return {
    v: EXPORT_SCHEMA,
    pair: s.item.pair,
    settings: { ...s.item.settings, resolved: { dpi: PX_PER_INCH, paddingPx: s.plan.padding, artboard: s.plan.artboard, scale: s.plan.scale, strokWidth: s.plan.stroke } },
    metadata: metadataRecord(s.meta ?? s.item.meta),
    tools: s.tools,
    outputs: [...outputRecords(s.item.pair.base, s.plan, { svg: text(s.svgText), jpg: s.jpeg, eps: s.epsBytes }, s.item.values), ...keptOutputs(s)],
    stages: s.stages,
    status: "processed",
    fingerprints: {
      source: s.item.pair.fingerprint,
      settings: fingerprintSettings(s.item.settings),
      svg: hashText(s.svgText),
      jpeg: s.jpeg === null ? null : hashText(latin(s.jpeg)),
    },
    validation: { ok: false, errors: [], warnings: [] },
    error: null,
    createdAt: previous?.createdAt ?? s.at,
    updatedAt: s.at,
  };
}

/** A kept EPS is an output of the package even though this run did not write it. */
function keptOutputs(s: RunState): OutputRecord[] {
  return s.performed.eps || s.keptEps === null ? [] : [s.keptEps];
}

/** Which outputs the package will hold once this run is published. */
export function producedFormats(s: RunState): Record<"svg" | "jpg" | "eps", boolean> {
  return { svg: s.svgText !== "", jpg: s.jpeg !== null, eps: s.epsBytes !== null || keptOutputs(s).length > 0 };
}

/**
 * What a re-reader must be able to prove about this package (§21). Only the
 * REQUIRED outputs are errors: the requested JPEG and the SVG are what make a
 * package usable at all, while a missing OPTIONAL EPS is a Partial result — the
 * two are reported through different channels on purpose (R21).
 */
export function validateRun(s: RunState, record: ExportRecord): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  if (s.svgText === "" || !record.outputs.some((o) => o.format === "svg")) errors.push("no SVG output");
  if (s.item.requested.jpg && s.jpeg === null) errors.push("the requested JPEG was not produced");
  return { ok: errors.length === 0, errors, warnings: [...s.warnings] };
}
