// runner.ts — the public contract of the per-icon export job (design §9):
// the job-state union, the injected dependency bundle, the request/result
// shapes and the bounded-concurrency pool. The stage machine itself lives in
// job.ts (preflight → prepare → metadata → render → embed → eps → validate →
// commit → processed); every output is built and validated in memory first and
// the commit pass writes export.json LAST. One icon's failure never touches
// another's package. All dependencies are injected (RULE 8); no key, no
// payload, no image bytes ever reach the log (I-23/I-24).

import type { ExportSettings } from "../lib/upsettings";
import type { IconMetadata } from "../lib/upmeta";
import type { RasterDeps } from "../lib/upraster";
import type { PixelDeps } from "../lib/upsvgo";
import type { GeminiConfig } from "../lib/gemconfig";
import type { GeminiRequest, GeminiSendOut } from "../lib/geminireq";
import type { ExportDirScan, UploadRowSource } from "./sources";
import type { StagedCommit } from "./exportio";
import { Job } from "./job";

export type JobState =
  | "discovered" | "preflight" | "prepare" | "metadata" | "render" | "embed"
  | "eps" | "validate" | "commit" | "processed" | "failed" | "partial" | "cancelled";

export interface RunnerDeps {
  readSource(relPath: string): Promise<string | null>;
  scanExport(pairDirPath: string): Promise<ExportDirScan>;
  openExport(pairDirPath: string): Promise<StagedCommit | null>;
  hashText(text: string): Promise<string>;
  raster: RasterDeps;
  pixels: PixelDeps;
  /** Base64 PNG of the icon preview, sent to the metadata provider. */
  renderPreviewPng(svg: string): Promise<string | null>;
  sendMetadata(request: GeminiRequest): Promise<GeminiSendOut>;
  now(): string;
  onState?(id: string, state: JobState, detail?: string): void;
  cancelled?(): boolean;
}

export interface JobRequest {
  row: UploadRowSource;
  settings: ExportSettings;
  prompt: string;
  apiKey: string;
  gemini: GeminiConfig;
  /** Accepted (UI) or cached metadata; when absent and allowAi, generated. */
  metadata: IconMetadata | null;
  allowAi: boolean;
}

export type JobResult =
  | { ok: true; record: import("../lib/upexport").ExportRecord; plan: import("../lib/upfinger").StagePlan }
  | { ok: false; state: "failed" | "partial" | "cancelled"; error: string; record: import("../lib/upexport").ExportRecord | null };

/** Runs one icon's export job end to end; never throws (R09). A thrown
 * dependency fault becomes a typed failed result so one icon can never sink
 * the pool or a neighbour's package. */
export async function runUploadJob(req: JobRequest, deps: RunnerDeps): Promise<JobResult> {
  try {
    return await new Job(req, deps).run();
  } catch (e) {
    const kind = e instanceof Error ? e.name : "error";
    deps.onState?.(req.row.id, "failed");
    return { ok: false, state: "failed", error: `the export job was interrupted by an unexpected ${kind}`, record: null };
  }
}

/** Bounded-concurrency pool; results keyed by pair id. One failure never touches another. */
export async function runUploadJobs(
  requests: JobRequest[], deps: RunnerDeps, opts: { concurrency: number },
): Promise<Map<string, JobResult>> {
  const results = new Map<string, JobResult>();
  let cursor = 0;
  const width = Math.max(1, Math.min(opts.concurrency, requests.length));
  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= requests.length) return;
      results.set(requests[i].row.id, await runUploadJob(requests[i], deps));
    }
  });
  await Promise.all(workers);
  return results;
}
