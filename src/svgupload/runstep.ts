// runstep.ts — the staged work of ONE export (design §16). Split from
// exporter.ts so the module that DEFINES an export (its item, its seams, its
// outcome) stays small and readable, while the sequence lives here:
//   preflight → metadata (once) → prepare (or reuse) → optimize → embed
//   → render → eps → validate → commit
// Every step records itself, every failure returns BEFORE the publish call, and
// nothing in this file deletes anything — which is why a failed run leaves the
// previous package exactly as it was (§6).
import type { ExportPlan } from "../lib/svgupload/prepare";
import { buildExportSvg, warningsOf } from "../lib/svgupload/prepare";
import { metadataEquals, readMetadata, withMetadata, type MetaText, withoutMetadata } from "../lib/svgupload/mime";
import type { JpegMeta } from "../lib/svgupload/jpegseg";
import { type ExportRecord, type OutputRecord, type StageName, type StageRecord, type ToolRecord } from "../lib/svgupload/exportjson";
import { planEps } from "../lib/svgupload/eps";
import type { EpsRequest } from "../lib/svgupload/epswrite";
import { runEpsStage } from "./epsstage";
import { reembedFiles } from "./reembed";
import { epsRequestOf, exportPlan, producedFormats, recordFor, validateRun, type Performed, type RunState } from "./runrecord";
import { statusAfter, type RegenPlan } from "../lib/svgupload/states";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import { exportDirOf, packageNames, publishPackage } from "./package";
import { metaText, noteFor, text } from "./exportrecord";
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
  /** The EPS the previous package already holds: a re-stamp must not lose it. */
  private keptEps: OutputRecord | null = null;
  /** Which outputs this run actually worked on (see `Performed`). */
  private performed: Performed = { jpg: false, eps: false };

  constructor(private readonly d: RunDeps) {}

  private get item(): ExportItem { return this.d.item; }

  private get io(): ExportIo { return this.d.io; }

  private get regen(): RegenPlan { return this.d.regen; }

  async execute(): Promise<ExportOut> {
    if (this.regen.reembed) return await this.reembed();
    if (!this.preflight()) return this.fail(this.errors.join(" "));
    if (this.regen.needsMetadata) await this.generate();
    if (this.errors.length > 0) return this.fail(this.errors.join(" "));
    if (!(await this.build())) return this.fail(this.errors.join(" "));
    if (!(await this.produce())) return this.fail(this.errors.join(" "));
    return await this.publish();
  }

  /**
   * Renders what the request asked for. False when a REQUIRED output failed — a
   * JPEG that could not be encoded stops the run BEFORE anything is published, so
   * a fresh SVG can never be written beside the previous package's old JPEG
   * (R20/R21: Partial is for a deliberately optional output, not for a failure).
   */
  private async produce(): Promise<boolean> {
    if (this.item.requested.jpg) {
      this.performed.jpg = true;
      await this.render();
    }
    if (this.item.requested.eps) {
      this.performed.eps = true;
      await this.convertEps();
    }
    return this.errors.length === 0;
  }

  /**
   * A metadata-only edit: the published SVG and the published JPEG keep their
   * artwork and are re-stamped with the accepted text. Nothing is rendered, no
   * request is sent, and the EPS the package already holds is carried over
   * untouched — the three things a 15 MP re-render would have cost for a renamed
   * title (report R12: a rebuild must not forget an output it did not touch).
   */
  private async reembed(): Promise<ExportOut> {
    if (this.io.signal?.aborted === true) return this.cancelled();
    const accepted = this.metaText();
    if (accepted === null) return this.fail("The accepted metadata is missing, so there is nothing to re-stamp.");
    const out = await reembedFiles({
      meta: accepted,
      embed: (svg) => this.embed(svg),
      read: async () => ({ svg: await this.io.publishedSvg(this.item), jpg: await this.io.publishedJpeg(this.item) }),
    });
    if (!out.ok) return this.fail(out.reason === "" ? this.errors.join(" ") : out.reason);
    this.svgText = out.svg;
    this.jpeg = out.jpg;
    this.keptEps = this.item.present.eps ? (this.item.record?.outputs.find((o) => o.format === "eps") ?? null) : null;
    this.mark("embed", "ok", "metadata only");
    return await this.publish();
  }

  /** Preflight: what would stop the export, said before any work is done. */
  private preflight(): boolean {
    if (!this.item.sourceText.includes("<svg")) this.errors.push("The chosen SVG has no root <svg> element.");
    // EPS is NOT gated on a converter any more: the local writer needs none, so
    // what happens to it is decided by the document (and said when it fails).
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
    const optimized = await this.io.optimize(built, this.item.values.optimizeSvg);
    this.warnings.push(...optimized.warnings);
    this.tools.push({ name: "svgo", version: optimized.version, config: { mode: optimized.mode, applied: optimized.applied, differences: optimized.differences.length } });
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
    const withMeta = withMetadata(withoutMetadata(code), accepted);
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

  /**
   * EPS, written locally when the document is inside the writer's subset and by
   * the configured converter otherwise; a refusal is Partial with the named
   * reason and no invented file (§3.2, §13).
   */
  private async convertEps(): Promise<void> {
    const plan = planEps(true, this.item.values.epsConverter);
    const stage = await runEpsStage({ svg: this.svgText, plan, request: this.epsRequest(), eps: this.io.eps });
    if (stage.ok && stage.bytes !== null && stage.tool !== null) {
      this.epsBytes = stage.bytes;
      this.tools.push(stage.tool);
      this.mark("eps", "ok", stage.word);
      return;
    }
    this.warnings.push(stage.word);
    this.mark("eps", "failed", stage.word);
  }

  /** The artboard and the stroke override, as the EPS writer must see them. */
  private epsRequest(): EpsRequest {
    return epsRequestOf(this.planFor());
  }

  /** Validate, then publish. A required gap publishes nothing at all (§15). */
  private async publish(): Promise<ExportOut> {
    if (this.io.signal?.aborted === true) return this.cancelled();
    const state = this.state(this.io.now());
    const record = recordFor(state);
    const validation = validateRun(state, record);
    if (!validation.ok) return this.fail(validation.errors.join(" "));
    const status = statusAfter({
      requested: this.item.requested,
      // A kept EPS is present in the package even though this run did not build it.
      produced: producedFormats(state),
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

  /** Everything the record and its validation read, in one object (§2). */
  private state(at: string): RunState {
    return {
      item: this.item, plan: this.planFor(), stages: this.stages, tools: this.tools, performed: this.performed,
      svgText: this.svgText, jpeg: this.jpeg, epsBytes: this.epsBytes, keptEps: this.keptEps,
      meta: this.meta, warnings: this.warnings, at,
    };
  }

  private planFor(): ExportPlan {
    this.plan ??= exportPlan(this.item);
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

  /** Cancelled at the publication boundary: nothing new is written (§22). */
  private cancelled(): ExportOut {
    return {
      status: "cancelled", record: null,
      note: "Cancelled — nothing new was published; packages finished earlier were kept.",
      folderPath: exportDirOf(this.item.pair.dirPath), skipped: false, meta: this.meta ?? this.item.meta,
    };
  }

  private fail(reason: string): ExportOut {
    return {
      status: "failed", record: null,
      note: `Failed: ${reason === "" ? "unknown reason" : reason} The previous package was left as it was.`,
      folderPath: exportDirOf(this.item.pair.dirPath), skipped: false, meta: this.meta ?? this.item.meta,
    };
  }
}

