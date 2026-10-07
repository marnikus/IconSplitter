// runstep.ts — the staged work of ONE export (design §16). Split from
// exporter.ts so the module that DEFINES an export (its item, its seams, its
// outcome) stays small and readable, while the sequence lives here:
//   preflight → metadata (once) → prepare (or reuse) → optimize → embed
//   → render → eps → validate → commit
// Every step records itself, every failure returns BEFORE the publish call, and
// nothing in this file deletes anything — which is why a failed run leaves the
// previous package exactly as it was (§6).
import type { ExportPlan } from "../lib/svgupload/prepare";
import { boundsOfDocument, buildExportSvg, planExport, warningsOf } from "../lib/svgupload/prepare";
import { metadataEquals, readMetadata, withMetadata, type MetaText } from "../lib/svgupload/mime";
import type { JpegMeta } from "../lib/svgupload/jpegseg";
import { EXPORT_SCHEMA, fingerprintSettings, hashText, type ExportRecord, type StageName, type StageRecord, type ToolRecord } from "../lib/svgupload/exportjson";
import { planEps, verifyEps } from "../lib/svgupload/eps";
import { statusAfter, type RegenPlan } from "../lib/svgupload/states";
import { PX_PER_INCH } from "../lib/svgupload/units";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import { exportDirOf, packageNames, publishPackage } from "./package";
import { latin, metadataRecord, metaText, noteFor, outputRecords, text, widestStroke } from "./exportrecord";
import type { ExportIo, ExportItem, ExportOut, ExportValues } from "./exporter";
import type { RasterOut } from "./raster";

export interface RunDeps {
  item: ExportItem;
  io: ExportIo;
  regen: RegenPlan;
  /** The values, passed in so the run never reaches into the plan itself. */
  values: ExportValues;
}

/** One export run: small steps, each reporting its own failure. */
export class Run {
  private readonly stages: StageRecord[] = [];
  private readonly warnings: string[] = [];
  private readonly errors: string[] = [];
  private readonly tools: ToolRecord[] = [];
  private readonly started = Date.now();
  private plan: ExportPlan | null = null;
  private meta: MetaRecord | null = null;
  private svgText = "";
  private jpeg: Uint8Array | null = null;
  private epsBytes: Uint8Array | null = null;

  constructor(private readonly d: RunDeps) {}

  private get item(): ExportItem { return this.d.item; }

  private get io(): ExportIo { return this.d.io; }

  private get regen(): RegenPlan { return this.d.regen; }

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
    if (eps.reason !== null) this.warnings.push(eps.reason); // requested with no converter: Partial, never fake
    this.warnings.push(...warningsOf(this.item.sourceText));
    this.mark("preflight", this.errors.length > 0 ? "failed" : "ok");
    return this.errors.length === 0;
  }

  /** The one paid step. An interrupted request is reported, never repeated. */
  private async generate(): Promise<void> {
    const out = await this.io.metadata(this.item);
    this.meta = out.record;
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
    const text2 = this.embed(optimized.svg);
    if (text2 === null) return false;
    this.svgText = text2;
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
    if (!this.acceptRaster(out)) return;
    this.mark("render", "ok", `${out.dims.width}×${out.dims.height} @ ${out.dims.mp} MP`);
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
    const record = this.recordFor();
    const validation = this.validate(record);
    const status = statusAfter({
      requested: this.item.requested,
      produced: { svg: true, jpg: this.jpeg !== null, eps: this.epsBytes !== null },
      hardFailure: false, cancelled: false, validationOk: validation.ok,
    });
    const final: ExportRecord = { ...record, validation, status };
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

  /** The record as far as it is known before validation (§5). */
  private recordFor(): ExportRecord {
    const plan = this.planFor();
    const at = this.io.now();
    const previous = this.item.record;
    return {
      v: EXPORT_SCHEMA,
      pair: this.item.pair,
      settings: { ...this.item.settings, resolved: { dpi: PX_PER_INCH, paddingPx: plan.padding, artboard: plan.artboard, scale: plan.scale, strokWidth: plan.stroke } },
      metadata: metadataRecord(this.meta),
      tools: this.tools,
      outputs: outputRecords(this.item.pair.base, plan, { svg: text(this.svgText), jpg: this.jpeg, eps: this.epsBytes }, this.item.values),
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

  /** The accepted metadata: the one this run generated, else the stored one. */
  private metaText(): MetaText | null {
    return metaText(this.meta ?? this.item.meta);
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

