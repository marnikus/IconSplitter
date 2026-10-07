// job.ts — the per-icon export stage machine (design §9): preflight → prepare
// → metadata → render → embed → eps → validate → commit, every output built
// and validated in memory first, export.json written LAST. runner.ts owns the
// public API and the pool; jobartifacts.ts owns the artifact decisions. All
// dependencies are injected (RULE 8); no key, payload or bytes reach the log.

import { parseScene, type GeomScene } from "../lib/upgeom";
import { sceneBounds } from "../lib/upbounds";
import { fitPlan, rasterSize, type FitPlan, type RasterSize } from "../lib/upfit";
import { buildExportSvg, embedSvgMetadata, parseSvgText } from "../lib/upprepare";
import { produceJpeg } from "../lib/upraster";
import { buildEps, epsPreflight } from "../lib/upeps";
import { parseMetadataResponse, type IconMetadata } from "../lib/upmeta";
import { readExportRecord, type ExportRecord } from "../lib/upexport";
import { resolveBackground } from "../lib/svgbackground";
import { buildJobRecord, embedJpegSegments, optimizeForDelivery, validateArtifacts, type JpegSegments } from "./jobartifacts";
import { buildGeminiRequest } from "../lib/geminireq";
import { fingerprintsOf, planReexport, type StagePlan } from "../lib/upfinger";
import type { ExportDirScan } from "./sources";
import type { OutputFile, StagedCommit } from "./exportio";
import type { JobRequest, JobResult, JobState, RunnerDeps } from "./runner";

/** The stage chain; each stage returns its failure reason or null. */
export class Job {
  private scan: ExportDirScan = { exportJson: null, outputs: [] };
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
  private svgSha = "";
  private sourceSha = "";
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
    const record = this.recordBuilt ?? await this.record("processed");
    return { ok: true, record, plan: this.stagePlan as StagePlan };
  }

  /** Reads the source, decides the plan; the geometry must be honest. */
  private async preflight(): Promise<string | null> {
    this.scan = await this.deps.scanExport(this.req.row.dirPath);
    this.meta = this.req.metadata;
    const read = this.scan.exportJson === null ? null : readExportRecord(this.scan.exportJson);
    this.committed = read !== null && read.ok ? read.record : null;
    const text = await this.deps.readSource(this.req.row.svgRelPath);
    if (text === null) return `the chosen SVG is unreadable: ${this.req.row.svgRelPath}`;
    this.doc = parseSvgText(text);
    if (this.doc === null) return "the chosen SVG does not parse";
    this.scene = parseScene(this.doc);
    if (this.scene.unsupported.has("complex-css")) return "the source uses CSS this pipeline cannot resolve honestly";
    if (this.scene.unsupported.has("unparsable-path")) return "the source contains an unparsable path";
    const sha = await this.deps.hashText(text);
    this.sourceSha = sha;
    this.stagePlan = await this.plan(sha);
    return null;
  }

  /** The selective plan (§9): compare the committed record with today. */
  private async plan(sourceSha: string): Promise<StagePlan> {
    const sha = sourceSha;
    // No metadata in hand → a sentinel that matches nothing, so the plan
    // re-embeds whatever the (possibly generated) metadata turns out to be.
    const meta = this.req.metadata ?? (this.req.allowAi ? PENDING_META : this.committed?.metadata ?? PENDING_META);
    const plan = planReexport({
      record: this.committed,
      current: fingerprintsOf({ sourceSha: sha, settings: this.req.settings, metadata: meta }),
      outputs: this.outputsPresent(),
      includeEps: this.req.settings.includeEps,
    });
    return this.meta === null && this.req.allowAi ? { ...plan, metadata: "generate" } : plan;
  }

  private outputsPresent(): { svg: boolean; jpeg: boolean; eps: boolean } {
    const base = this.req.row.iconBase;
    return {
      svg: this.scan.outputs.includes(`${base}.svg`),
      jpeg: this.scan.outputs.includes(`${base}.jpg`),
      eps: this.scan.outputs.includes(`${base}.eps`),
    };
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
    if (this.meta !== null) return null;
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
    this.finalSvg = await this.optimize(embedded);
    this.svgSha = await this.deps.raster.sha256(encode(this.finalSvg));
    return this.rasterize();
  }

  private async optimize(embedded: string): Promise<string> {
    const out = await optimizeForDelivery(embedded, this.req, this.deps);
    this.optimizer = out.optimizer;
    return out.svg;
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
    this.jpegStats = out.stats;
    return null;
  }

  private async epsStage(): Promise<string | null> {
    if (!this.req.settings.includeEps || this.stagePlan?.eps !== "build") return null;
    const issues = epsPreflight(this.scene as GeomScene);
    if (issues.length > 0) {
      this.epsFailure = `EPS skipped (${issues.join(", ")})`;
      return null;
    }
    const out = buildEps({
      svg: this.exportSvg, raster: this.raster, strokePt: this.req.settings.strokePt,
      title: (this.meta as IconMetadata).title,
    });
    if (typeof out !== "string") {
      this.epsFailure = `EPS failed: ${out.error}`;
      return null;
    }
    this.epsText = out;
    return null;
  }

  private async validate(): Promise<string | null> {
    return validateArtifacts(this.finalSvg, this.jpegBytes as Uint8Array, this.meta as IconMetadata);
  }

  /** The commit pass: files first, export.json LAST (design §9). */
  private async commit(): Promise<string | null> {
    const staged = await this.stagedOrOpen();
    if (staged === null) return "failed: the export folder could not be created";
    const files: OutputFile[] = [];
    const base = this.req.row.iconBase;
    if (this.stagePlan?.svg === "rebuild") files.push({ name: `${base}.svg`, bytes: encode(this.finalSvg) });
    if (this.stagePlan?.jpeg !== "keep") files.push({ name: `${base}.jpg`, bytes: this.jpegBytes as Uint8Array });
    if (this.epsText !== null) files.push({ name: `${base}.eps`, bytes: encode(this.epsText) });
    if (!(await staged.writeOutputs(files))) {
      return "partial: an output write failed — the previous record still describes the last valid state";
    }
    const state = this.epsCommitted() ? "processed" : "partial";
    this.recordBuilt = await this.record(state);
    if (!(await staged.commitRecord(this.recordBuilt))) {
      return "partial: the commit record could not be written — retry";
    }
    return this.epsCommitted() ? null : `partial: ${this.epsFailure ?? "an EPS output was requested but not committed"}`;
  }

  /** EPS is committed when built now, kept from a valid package, or not wanted. */
  private epsCommitted(): boolean {
    if (this.epsText !== null) return true;
    if (this.epsFailure !== null) return false;
    if (!this.req.settings.includeEps) return true;
    return this.stagePlan?.eps === "keep" && this.outputsPresent().eps;
  }

  private async record(state: "processed" | "partial"): Promise<ExportRecord> {
    const committedEps = this.stagePlan?.eps === "keep" ? this.committed?.outputs.eps ?? null : null;
    return buildJobRecord({
      req: this.req, deps: this.deps, meta: this.meta as IconMetadata, finalSvg: this.finalSvg,
      svgSha: this.svgSha, sourceSha: this.sourceSha, optimizer: this.optimizer, jpeg: this.jpegStats as import("./jobartifacts").JpegSegments["stats"],
      epsText: this.epsText, epsFailure: this.epsFailure, committedEps, state, now: this.deps.now(),
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

  /** A "partial:" failure is a partial package; everything else is failed. */
  private outcome(error: string): JobResult {
    const partial = error.startsWith("partial:");
    this.deps.onState?.(this.req.row.id, partial ? "partial" : "failed", error);
    return { ok: false, state: partial ? "partial" : "failed", error, record: null };
  }
}

/** Matches no real print, so a pending generation plans an honest re-embed. */
const PENDING_META: IconMetadata = { title: "\u2026pending generation", description: "\u2026pending generation", tags: ["pending-generation"] };

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
