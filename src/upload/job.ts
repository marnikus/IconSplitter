// job.ts — the per-icon export stage machine (design §9): preflight → prepare
// → metadata → render → embed → eps → validate → commit, every output built
// and validated in memory first, the pointer written LAST. All dependencies
// are injected (RULE 8); no key, payload or bytes ever reach the log.

import { parseScene, type GeomScene } from "../lib/upgeom";
import { sceneBounds } from "../lib/upbounds";
import { fitPlan, rasterSize, type FitPlan, type RasterSize } from "../lib/upfit";
import { buildExportSvg, embedSvgMetadata, parseSvgText } from "../lib/upprepare";
import { produceJpeg } from "../lib/upraster";
import { parseMetadataResponse, type IconMetadata } from "../lib/upmeta";
import { readExportRecord } from "../lib/upexportread";
import type { ExportRecord, MetadataProvenance } from "../lib/upexport";
import { resolveBackground } from "../lib/svgbackground";
import {
  aiProvenance, buildJobRecord, embedJpegSegments, encodeUtf8, epsCommitted, epsOutcome, keptOutputs,
  optimizeForDelivery, rebuiltOutputs, userProvenance, validateAccepted, type JpegSegments,
} from "./jobartifacts";
import { commitInputs, outputsPresent, planFor } from "./jobplan";
import { buildGeminiRequest } from "../lib/geminireq";
import type { StagePlan } from "../lib/upfinger";
import type { ExportDirScan } from "./sources";
import type { StagedCommit } from "./exportio";
import type { JobRequest, JobResult, JobState, RunnerDeps } from "./runner";

/** The stage chain; each stage returns its failure reason or null. */
export class Job {
  private scan: ExportDirScan = { exportJson: null, outputs: [], generation: null, legacy: false, corruptPointer: false };
  private committed: ExportRecord | null = null;
  private staged: StagedCommit | null = null;
  private doc: Document | null = null;
  private scene: GeomScene | null = null;
  private stagePlan: StagePlan | null = null;
  private fit!: FitPlan;
  private raster!: RasterSize;
  private exportSvg = "";
  private finalSvg = "";
  private optimizer: ExportRecord["outputs"]["svg"]["optimizer"] = null;
  private jpegBytes: Uint8Array | null = null;
  private jpegStats: JpegSegments["stats"] | null = null;
  private epsText: string | null = null;
  private epsFailure: string | null = null;
  private meta: IconMetadata | null = null;
  /** Where the accepted metadata came from; the source's content identity. */
  private provenance: MetadataProvenance | null = null;
  private sourceSha = "";
  private sourceBytes = 0;
  private svgSha = "";
  private recordBuilt: ExportRecord | null = null;

  constructor(private req: JobRequest, private deps: RunnerDeps) {}

  async run(): Promise<JobResult> {
    const steps: [JobState, () => Promise<string | null>][] = [
      ["preflight", () => this.preflight()],
      ["prepare", () => this.prepare()],
      ["metadata", () => this.metadata()],
      ["render", () => this.render()],
      ["embed", () => this.embed()],
      ["eps", () => this.epsStage()],
      ["validate", () => this.validate()],
      ["commit", () => this.commit()],
    ];
    for (const [state, step] of steps) {
      if (this.deps.cancelled?.()) return this.cancelled();
      this.deps.onState?.(this.req.row.id, state);
      const error = await step();
      if (error !== null) return this.outcome(error);
    }
    this.deps.onState?.(this.req.row.id, "processed");
    const record = this.recordBuilt ?? await this.record("processed", this.staged?.generation ?? "");
    return { ok: true, record, plan: this.stagePlan as StagePlan };
  }

  /** Reads the source, decides the plan; geometry must be honest. */
  private async preflight(): Promise<string | null> {
    this.scan = await this.deps.scanExport(this.req.row.dirPath);
    this.meta = this.req.metadata;
    const read = this.scan.exportJson === null ? null : readExportRecord(this.scan.exportJson);
    this.committed = read !== null && read.ok ? read.record : null;
    const bytes = await this.deps.readSourceBytes(this.req.row.svgRelPath);
    if (bytes === null) return `the chosen SVG is unreadable: ${this.req.row.svgRelPath}`;
    this.sourceSha = await this.deps.raster.sha256(bytes);
    this.sourceBytes = bytes.length;
    this.stagePlan = await this.plan();
    const text = new TextDecoder().decode(bytes);
    this.doc = parseSvgText(text);
    if (this.doc === null) return "the chosen SVG does not parse";
    this.scene = parseScene(this.doc);
    if (this.scene.unsupported.has("complex-css")) return "the source uses CSS this pipeline cannot resolve honestly";
    if (this.scene.unsupported.has("unparsable-path")) return "the source contains an unparsable path";
    return null;
  }

  /** The selective plan (§9) — jobplan owns the rule, preflight owns the facts. */
  private async plan(): Promise<StagePlan> {
    return planFor({
      committed: this.committed, sourceSha: this.sourceSha, settings: this.req.settings,
      metadata: this.req.metadata, allowAi: this.req.allowAi,
      present: outputsPresent(this.scan, this.req.row.iconBase),
    });
  }


  private async prepare(): Promise<string | null> {
    const bounds = sceneBounds(this.scene as GeomScene);
    if (bounds === null) return "the source has no drawable geometry";
    this.fit = fitPlan(bounds, { paddingPct: this.req.settings.paddingPct, artboard: this.req.settings.artboard });
    this.raster = rasterSize(this.fit, this.req.settings.jpegMpx);
    if (!this.stagePlan?.prepare) return null; // geometry still needed for eps/raster below
    const built = buildExportSvg({
      source: this.doc as Document,
      plan: this.fit,
      raster: this.raster,
      strokePt: this.req.settings.strokePt,
      background: resolveBackground(this.req.settings.background),
    });
    if (built === null) return "the export copy could not be built";
    this.exportSvg = built;
    return null;
  }

  /** Metadata: provided/cached first; the AI call is the paid fallback. */
  private async metadata(): Promise<string | null> {
    if (this.meta !== null) {
      this.provenance = this.provenance ?? this.req.metadataProvenance ?? userProvenance(this.req, this.deps.now());
      await this.deps.onMetadata?.(this.req.row.id, this.meta, this.provenance);
      return null;
    }
    if (!this.req.allowAi) return "no accepted metadata for this icon and AI generation is not allowed";
    const svgForPreview = this.exportSvg === "" ? await this.buildExportCopy() : this.exportSvg;
    if (svgForPreview === null) return "the export copy could not be built for the metadata request";
    const preview = await this.deps.renderPreviewPng(svgForPreview);
    if (preview === null) return "the icon preview could not be rendered for the metadata request";
    const request = buildGeminiRequest({
      config: this.req.gemini, apiKey: this.req.apiKey, prompt: this.req.prompt, imageBase64: preview,
    });
    const out = await this.deps.sendMetadata(request);
    if (!out.ok) return `metadata generation failed (${out.failure.kind}): ${out.failure.message}`;
    const parsed = parseMetadataResponse(out.text);
    if (!parsed.ok) return `the generated metadata does not pass validation: ${parsed.issues.join("; ")}`;
    this.meta = parsed.meta;
    this.provenance = aiProvenance(this.req, out, this.deps.now());
    // The paid result becomes durable BEFORE it is used (report §5): a crash
    // after this point can reuse it, and never asks the model again.
    await this.deps.onMetadata?.(this.req.row.id, parsed.meta, this.provenance);
    return null;
  }

  /** Finalizes the delivered SVG (metadata embedded, optimized, compared), then the raster. */
  private async render(): Promise<string | null> {
    const meta = this.meta as IconMetadata;
    if (this.exportSvg === "") {
      const rebuilt = await this.buildExportCopy();
      if (rebuilt === null) return "the export copy could not be rebuilt for re-embedding";
      this.exportSvg = rebuilt;
    }
    const embedded = embedSvgMetadata(this.exportSvg, meta);
    if (embedded === null) return "the SVG metadata could not be embedded";
    const optimized = await optimizeForDelivery(embedded, this.req, this.deps);
    this.optimizer = optimized.optimizer;
    this.finalSvg = optimized.svg;
    this.svgSha = await this.deps.raster.sha256(encodeUtf8(this.finalSvg));
    return this.rasterize();
  }

  private async rasterize(): Promise<string | null> {
    const jpegPlan = this.stagePlan?.jpeg ?? "rebuild";
    if (jpegPlan === "keep" || jpegPlan === "reembed") {
      // keep: the committed pixels stand; reembed: only the segments change.
      const staged = await this.stagedOrOpen();
      const existing = staged === null ? null : await staged.readOutput(`${this.req.row.iconBase}.jpg`);
      if (existing !== null) {
        this.jpegBytes = existing;
        return null;
      }
      // missing on disk → honest rebuild, never a silent keep
    }
    const out = await produceJpeg(
      this.finalSvg, this.fit,
      { mpx: this.req.settings.jpegMpx, quality: this.req.settings.jpegQuality, background: resolveBackground(this.req.settings.background) },
      this.deps.raster,
    );
    if (!out.ok) return `the JPEG stage failed: ${out.error}`;
    this.jpegBytes = out.bytes;
    this.jpegStats = { width: out.width, height: out.height, mpx: out.mpx, sha256: out.hash, bytes: out.bytes.length };
    return null;
  }

  /** JPEG segment surgery: XMP + IPTC into the (new or existing) JPEG bytes. */
  private async embed(): Promise<string | null> {
    const out = await embedJpegSegments(this.jpegBytes as Uint8Array, this.meta as IconMetadata, this.deps);
    if (out === null) return "the JPEG metadata exceeded the 65 502-byte segment limit";
    this.jpegBytes = out.bytes;
    // R08: the manifest describes the bytes that are actually committed —
    // always recomputed after the segment surgery, never the pre-embed stats.
    this.jpegStats = out.stats;
    return null;
  }

  private async epsStage(): Promise<string | null> {
    const out = epsOutcome({
      scene: this.scene as GeomScene, settings: this.req.settings, plan: this.stagePlan,
      exportSvg: this.exportSvg, raster: this.raster, strokePt: this.req.settings.strokePt,
      title: (this.meta as IconMetadata).title,
    });
    this.epsText = out.text;
    this.epsFailure = out.failure;
    return null;
  }

  /** The export boundary (RULE 15, R06) — jobartifacts performs the readback. */
  private async validate(): Promise<string | null> {
    return validateAccepted({
      meta: this.meta as IconMetadata, finalSvg: this.finalSvg,
      jpegBytes: this.jpegBytes as Uint8Array, provenance: this.provenance,
    });
  }

  /**
   * The commit pass (R01): the generation is written WHOLE — rebuilt files plus
   * byte copies of every kept output — and only then does the pointer move, so
   * a failure leaves the previous generation untouched.
   */
  private async commit(): Promise<string | null> {
    const staged = await this.stagedOrOpen();
    if (staged === null) return "failed: the export folder could not be created";
    const failure = await this.publishOutputs(staged);
    if (failure !== null) return failure;
    const state = epsCommitted(this.commitInputs()) ? "processed" : "partial";
    this.recordBuilt = await this.record(state, staged.generation);
    if (!(await staged.commitRecord(this.recordBuilt))) {
      return "partial: the commit pointer could not be written — the previous package still stands; retry";
    }
    await staged.pruneOldGenerations();
    return epsCommitted(this.commitInputs()) ? null : `partial: ${this.epsFailure ?? "an EPS output was requested but not committed"}`;
  }

  /** Every R07/R12/R21 decision reads ONE bundle (jobartifacts owns the rules). */
  private commitInputs() {
    return commitInputs({
      plan: this.stagePlan, base: this.req.row.iconBase,
      present: outputsPresent(this.scan, this.req.row.iconBase),
      settings: this.req.settings, epsText: this.epsText, epsFailure: this.epsFailure,
    });
  }

  /** Writes the rebuilt outputs, then carries every kept one into the generation. */
  private async publishOutputs(staged: StagedCommit): Promise<string | null> {
    const rebuilt = rebuiltOutputs({
      plan: this.stagePlan, base: this.req.row.iconBase, finalSvg: this.finalSvg,
      jpegBytes: this.jpegBytes, epsText: this.epsText,
    });
    if (rebuilt.length > 0 && !(await staged.writeOutputs(rebuilt))) {
      return "partial: an output write failed — the previous package still stands; retry";
    }
    for (const kept of keptOutputs(this.commitInputs())) {
      if (!(await staged.copyOutput(kept))) {
        return `partial: the kept output ${kept} could not be carried into the new generation — retry`;
      }
    }
    return null;
  }

  private async record(state: "processed" | "partial", generation: string): Promise<ExportRecord> {
    return buildJobRecord({
      req: this.req, deps: this.deps, meta: this.meta as IconMetadata, finalSvg: this.finalSvg,
      svgSha: this.svgSha, sourceSha: this.sourceSha, sourceBytes: this.sourceBytes,
      provenance: this.provenance as MetadataProvenance, generation,
      optimizer: this.optimizer, jpeg: this.jpegStats as JpegSegments["stats"],
      epsText: this.epsText, epsFailure: this.epsFailure, state, now: this.deps.now(),
    });
  }

  /** The export copy builder (shared by prepare, preview and re-embed). */
  private async buildExportCopy(): Promise<string | null> {
    return buildExportSvg({
      source: this.doc as Document, plan: this.fit, raster: this.raster,
      strokePt: this.req.settings.strokePt, background: resolveBackground(this.req.settings.background),
    });
  }

  private async stagedOrOpen(): Promise<StagedCommit | null> {
    if (this.staged === null) this.staged = await this.deps.openExport(this.req.row.dirPath);
    return this.staged;
  }

  private cancelled(): JobResult {
    this.deps.onState?.(this.req.row.id, "cancelled");
    return { ok: false, state: "cancelled", error: "cancelled", record: null };
  }

  /** A "partial:" failure is a partial package; anything else is failed. */
  private outcome(error: string): JobResult {
    const partial = error.startsWith("partial:");
    this.deps.onState?.(this.req.row.id, partial ? "partial" : "failed", error);
    return { ok: false, state: partial ? "partial" : "failed", error, record: null };
  }
}
