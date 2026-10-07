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
// nothing here deletes, and a failure returns before the publish step — which is
// why the previous package survives every case in the failure table (§6).

import type { DirHandleLike } from "../lib/fs";
import { boundsOfDocument } from "../lib/svgupload/prepare";
import { buildExportSvg, planExport, warningsOf, type ExportPlan } from "../lib/svgupload/prepare";
import { withMetadata, readMetadata, metadataEquals, type MetaText } from "../lib/svgupload/mime";
import type { JpegMeta } from "../lib/svgupload/jpegseg";
import {
  EXPORT_SCHEMA, fingerprintSettings, hashText, type ExportRecord, type MetadataRecord, type OutputFormat,
  type OutputRecord, type SettingsSnapshot, type SourceRef, type StageName, type StageRecord, type ToolRecord,
} from "../lib/svgupload/exportjson";
import { planEps, verifyEps, type EpsPlan } from "../lib/svgupload/eps";
import { planRegeneration, statusAfter, type RegenPlan } from "../lib/svgupload/states";
import { jpegTarget } from "../lib/svgupload/target";
import { PX_PER_INCH } from "../lib/svgupload/units";
import { POLICY_ID, type MetaRecord } from "../lib/svgupload/metaprompt";
import { exportDirOf, outputRecord, packageNames, publishPackage, type PackageRead } from "./package";
import type { OptimizeOut } from "./optimizer";
import type { RasterArgs, RasterOut } from "./raster";

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
  return await new Run(item, io, plan).execute();
}

function planOf(item: ExportItem): RegenPlan {
  return planRegeneration({
    record: item.record, present: item.present, requested: item.requested,
    sourceFingerprint: item.pair.fingerprint, settingsFingerprint: fingerprintSettings(item.settings),
    metadataReady: hasAcceptedMeta(item.meta), metadataFresh: item.metaFresh,
  });
}

function hasAcceptedMeta(meta: MetaRecord | null): boolean {
  return meta !== null && meta.status === "accepted" && meta.title !== "";
}

/** One export run: small steps, each reporting its own failure. */
class Run {
  private readonly stages: StageRecord[] = [];
  private readonly warnings: string[] = [];
  private readonly errors: string[] = [];
  private readonly tools: ToolRecord[] = [];
  private readonly started = Date.now();
  private plan: ExportPlan | null = null;
  private meta: MetaRecord | null = null;
  private metaSeen = false;
  private svgText = "";
  private jpeg: Uint8Array | null = null;
  private epsBytes: Uint8Array | null = null;

  constructor(private readonly item: ExportItem, private readonly io: ExportIo, private readonly regen: RegenPlan) {}

  async execute(): Promise<ExportOut> {
    if (!this.preflight()) return this.fail(this.errors.join(" "));
    if (this.regen.needsMetadata) await this.generate();
    if (this.errors.length > 0) return this.fail(this.errors.join(" "));
    if (!(await this.build())) return this.fail(this.errors.join(" "));
    if (this.item.requested.jpg) await this.render();
    if (this.item.requested.eps) await this.convertEps();
    return await this.publish();
  }

  /** Preflight: what would stop the export, said before any work is done. */
  private preflight(): boolean {
    if (!this.item.sourceText.includes("<svg")) this.errors.push("The chosen SVG has no root <svg> element.");
    const eps = planEps(this.item.requested.eps, this.item.values.epsConverter);
    if (eps.reason !== null) this.warnings.push(eps.reason); // EPS requested with no converter: Partial, never fake
    this.warnings.push(...warningsOf(this.item.sourceText));
    this.mark("preflight", this.errors.length > 0 ? "failed" : "ok");
    return this.errors.length === 0;
  }

  /** The one paid step. An interrupted request is reported, never repeated. */
  private async generate(): Promise<void> {
    const out = await this.io.metadata(this.item);
    this.meta = out.record;
    this.metaSeen = true;
    if (out.meta === null) {
      this.errors.push(`The metadata could not be accepted: ${out.error ?? "the answer was refused."}`);
      this.mark("metadata", "failed", out.error ?? "refused");
      return;
    }
    this.mark("metadata", "ok");
  }

  /** Prepare (or reuse) → optimize → embed: the document written as the SVG. */
  private async build(): Promise<boolean> {
    const built = await this.buildBase();
    if (built === null) return false;
    const optimized = this.io.optimize(built, this.item.values.optimizeSvg);
    this.warnings.push(...optimized.warnings);
    this.tools.push({ name: "svgo", version: optimized.version, config: { applied: optimized.applied, differences: optimized.differences.length } });
    const text = this.embed(optimized.svg);
    if (text === null) return false;
    this.svgText = text;
    this.mark("optimize", optimized.applied ? "ok" : "skipped", optimized.applied ? undefined : "the unoptimised copy was kept");
    this.mark("embed", this.metaText() === null ? "skipped" : "ok");
    return true;
  }

  /** The prepared document: rebuilt from the source, or the published one. */
  private async buildBase(): Promise<string | null> {
    if (!this.regen.stages.includes("prepare")) {
      const published = await this.io.publishedSvg(this.item);
      if (published === null) {
        this.errors.push("The published SVG could not be read, so the missing output could not be rebuilt.");
        return null;
      }
      this.mark("prepare", "skipped", "the published SVG was reused");
      return published;
    }
    const built = buildExportSvg({ source: this.item.sourceText, plan: this.planFor(), meta: null });
    this.warnings.push(...built.warnings);
    this.mark("prepare", "ok");
    return built.svg;
  }

  /** Embeds the ACCEPTED metadata, then reads it back and compares (§11). */
  private embed(code: string): string | null {
    const accepted = this.metaText();
    if (accepted === null) return code;
    const withMeta = withMetadata(code, accepted);
    if (!metadataEquals(readMetadata(withMeta), accepted)) {
      this.errors.push("The embedded metadata did not read back as the accepted values.");
      this.mark("embed", "failed", "readback mismatch");
      return null;
    }
    return withMeta;
  }

  /** The JPEG: rendered from the export bytes, with APP1/APP13 injected. */
  private async render(): Promise<void> {
    const plan = this.planFor();
    const out = await this.io.raster({
      svg: this.svgText, background: plan.background, targetMp: this.item.values.jpeg.targetMp,
      ratio: plan.artboard.w / plan.artboard.h, quality: this.item.values.jpeg.quality, meta: this.jpegMeta(),
    });
    const done = this.acceptRaster(out);
    if (done) this.mark("render", "ok", `${out.dims.width}×${out.dims.height} @ ${out.dims.mp} MP`);
  }

  private acceptRaster(out: RasterOut): out is Extract<RasterOut, { ok: true }> {
    if (out.ok) {
      this.warnings.push(...out.warnings);
      this.jpeg = out.bytes;
      this.tools.push({ name: "canvas-jpeg", version: `q${this.item.values.jpeg.quality}`, config: { width: out.dims.width, height: out.dims.height, mp: out.dims.mp } });
      return true;
    }
    this.errors.push(out.reason);
    this.mark("render", "failed", out.reason);
    return false;
  }

  /** EPS only when a genuine converter exists; otherwise Partial and honest. */
  private async convertEps(): Promise<void> {
    const plan = planEps(true, this.item.values.epsConverter);
    if (plan.converter === null) {
      const reason = plan.reason ?? "No EPS converter is configured.";
      this.warnings.push(reason);
      this.mark("eps", "skipped", reason);
      return;
    }
    const out = await this.io.eps(this.svgText, plan);
    const check = out.ok ? verifyEps(out.bytes) : null;
    if (out.ok && check !== null && check.ok) {
      this.epsBytes = out.bytes;
      this.mark("eps", "ok");
      return;
    }
    const reason = out.ok ? check?.errors[0] ?? "The converter did not return an EPS." : out.reason;
    this.warnings.push(reason);
    this.mark("eps", "failed", reason);
  }

  /** Validate, then publish. The record is written last, inside the package. */
  private async publish(): Promise<ExportOut> {
    const plan = this.planFor();
    const record = this.recordFor(plan);
    const validation = this.validate(record);
    const status = statusAfter({
      requested: this.item.requested,
      produced: { svg: true, jpg: this.jpeg !== null, eps: this.epsBytes !== null },
      hardFailure: false, cancelled: false, validationOk: validation.ok,
    });
    const final: ExportRecord = { ...record, validation, status, stages: this.stages };
    this.mark("validate", validation.ok ? "ok" : "failed", validation.errors[0]);
    const out = await publishPackage(this.io.root, {
      dirPath: this.item.pair.dirPath, base: this.item.pair.base,
      svg: { name: packageNames(this.item.pair.base).svg, bytes: text(this.svgText) },
      jpg: this.jpeg === null ? null : { name: packageNames(this.item.pair.base).jpg, bytes: this.jpeg },
      eps: this.epsBytes === null ? null : { name: packageNames(this.item.pair.base).eps, bytes: this.epsBytes },
      record: { ...final, stages: [...this.stages, this.mark("commit")] },
    });
    if (!out.ok) return this.fail(out.errors.join(" "));
    return { status, record: final, note: noteFor(status, this.warnings, validation.errors), folderPath: exportDirOf(this.item.pair.dirPath), skipped: false, meta: this.meta };
  }

  /** The record as far as it is known before validation. */
  private recordFor(plan: ExportPlan): ExportRecord {
    const at = this.io.now();
    const previous = this.item.record;
    return {
      v: EXPORT_SCHEMA,
      pair: this.item.pair,
      settings: { ...this.item.settings, resolved: { dpi: PX_PER_INCH, paddingPx: plan.padding, artboard: plan.artboard, scale: plan.scale, strokWidth: plan.stroke } },
      metadata: metadataRecord(this.meta),
      tools: this.tools,
      outputs: this.outputs(plan),
      stages: this.stages,
      status: "processed",
      fingerprints: {
        source: this.item.pair.fingerprint,
        settings: fingerprintSettings(this.item.settings),
        svg: hashText(this.svgText),
        jpeg: this.jpeg === null ? null : hashText(latin(this.jpeg)),
      },
      validation: { ok: false, errors: [], warnings: [] },
      error: null,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
    };
  }

  private outputs(plan: ExportPlan): OutputRecord[] {
    const names = packageNames(this.item.pair.base);
    const out: OutputRecord[] = [outputRecord("svg", names.svg, text(this.svgText))];
    if (this.jpeg !== null) {
      const dims = jpegTarget(this.item.values.jpeg.targetMp, plan.artboard.w / plan.artboard.h);
      out.push(outputRecord("jpg", names.jpg, this.jpeg, { width: dims.width, height: dims.height, mp: dims.mp, quality: this.item.values.jpeg.quality }));
    }
    if (this.epsBytes !== null) out.push(outputRecord("eps", names.eps, this.epsBytes));
    return out;
  }

  /** What a re-reader must be able to prove about this package (§21). */
  private validate(record: ExportRecord): { ok: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    if (this.svgText === "" || !record.outputs.some((o) => o.format === "svg")) errors.push("no SVG output");
    if (this.item.requested.jpg && this.jpeg === null) errors.push("the requested JPEG was not produced");
    if (this.item.requested.eps && this.epsBytes === null) errors.push("the requested EPS was not produced");
    return { ok: errors.length === 0, errors, warnings: [...this.warnings] };
  }

  private planFor(): ExportPlan {
    if (this.plan === null) {
      this.plan = planExport({
        bounds: boundsOfDocument(this.item.sourceText), padding: this.item.values.padding,
        outputScale: this.item.values.outputScale, stroke: this.item.values.stroke,
        documentStrokePx: widestStroke(this.item.sourceText), background: this.item.values.background,
      });
    }
    return this.plan;
  }

  /** The accepted metadata, or the one this run just generated. */
  private metaText(): MetaText | null {
    const source = this.meta === null && !this.metaSeen ? this.item.meta : this.meta;
    return metaText(source);
  }

  private jpegMeta(): JpegMeta | null {
    return this.metaText();
  }

  private mark(stageName: StageName, status: StageRecord["status"] = "ok", note?: string): StageRecord {
    const record: StageRecord = { stage: stageName, at: new Date().toISOString(), ms: Math.max(0, Date.now() - this.started), status };
    this.stages.push(note === undefined ? record : { ...record, note });
    return record;
  }

  private fail(reason: string): ExportOut {
    return {
      status: "failed", record: null,
      note: `Failed: ${reason === "" ? "unknown reason" : reason} The previous package was left as it was.`,
      folderPath: exportDirOf(this.item.pair.dirPath), skipped: false, meta: this.meta ?? this.item.meta,
    };
  }
}

/** The accepted metadata as plain text for the two embedders. */
export function metaText(meta: MetaRecord | null): MetaText | null {
  if (meta === null || meta.status !== "accepted") return null;
  return { title: meta.title, description: meta.description, tags: meta.tags };
}

function metadataRecord(meta: MetaRecord | null): MetadataRecord | null {
  if (meta === null || meta.status !== "accepted") return null;
  return {
    policy: POLICY_ID, title: meta.title, description: meta.description, tags: meta.tags,
    prompt: meta.prompt, provider: meta.provider, model: meta.model, requestId: meta.requestId,
    tokens: meta.usage, cost: { actual: meta.cost.actual, estimated: meta.cost.estimated, currency: meta.cost.currency, estimatedOnly: meta.cost.actual === null },
    generatedAt: meta.at,
  };
}

function noteFor(status: ExportRecord["status"], warnings: string[], errors: string[]): string {
  if (status === "partial") return `Partial: ${warnings[0] ?? "a requested output could not be produced."}`;
  if (status === "failed") return `Failed: ${errors[0] ?? "unknown reason"}`;
  if (warnings.length > 0) return `Exported with a note: ${warnings[0]}`;
  return "Exported and verified.";
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** A byte array as a Latin-1 string, for the FNV hash of the JPEG. */
function latin(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** The widest specified stroke in the document, for the stroke-scale factor. */
export function widestStroke(svg: string): number | null {
  const widths = [...svg.matchAll(/stroke-width\s*[:=]\s*"?([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0);
  return widths.length === 0 ? null : Math.max(...widths);
}
