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
import type { MetadataProvenance } from "../lib/upexport";
import type { ExportDirScan, UploadRowSource } from "./sources";
import type { StagedCommit } from "./exportio";
import type { JournalStore } from "./jobjournal";
import { jobJournal, tracedDeps } from "./jobjournal";
import { Job } from "./job";

export type JobState =
  | "discovered" | "preflight" | "prepare" | "metadata" | "render" | "embed"
  | "eps" | "validate" | "commit" | "processed" | "failed" | "partial" | "cancelled";

export interface RunnerDeps {
  /**
   * The chosen source file's ACTUAL bytes (report R02). The record's source
   * identity is the SHA-256 of these bytes — never of a path or a stat.
   */
  readSourceBytes(relPath: string): Promise<Uint8Array | null>;
  scanExport(pairDirPath: string): Promise<ExportDirScan>;
  openExport(pairDirPath: string): Promise<StagedCommit | null>;
  raster: RasterDeps;
  pixels: PixelDeps;
  /** Base64 PNG of the icon preview, sent to the metadata provider. */
  renderPreviewPng(svg: string): Promise<string | null>;
  sendMetadata(request: GeminiRequest): Promise<GeminiSendOut>;
  now(): string;
  onState?(id: string, state: JobState, detail?: string): void;
  cancelled?(): boolean;
  /**
   * The durable attempt journal (report R10). When present, every stage
   * transition is written before the next stage starts, so a crash leaves an
   * `interrupted` run that recovery can see — and never auto-resumes.
   */
  journal?: JournalStore;
  /**
   * Called the moment an answer is ACCEPTED, before any artifact is written —
   * the draft that lets a paid result survive a crash (no second request).
   */
  onMetadata?(id: string, meta: IconMetadata, provenance: MetadataProvenance): Promise<void> | void;
}

export interface JobRequest {
  row: UploadRowSource;
  /** The picked root's identity (captured path when available, else its name). */
  rootName: string;
  settings: ExportSettings;
  prompt: string;
  apiKey: string;
  gemini: GeminiConfig;
  /** Accepted (UI), cached or recovered metadata; absent ⇒ generate when allowed. */
  metadata: IconMetadata | null;
  /**
   * The provenance of `metadata` when it was NOT typed by a human just now —
   * a recovered or cached AI answer must never be recorded as a user answer.
   */
  metadataProvenance?: MetadataProvenance | null;
  allowAi: boolean;
}

export type JobResult =
  | { ok: true; record: import("../lib/upexport").ExportRecord; plan: import("../lib/upfinger").StagePlan }
  | { ok: false; state: "failed" | "partial" | "cancelled"; error: string; record: import("../lib/upexport").ExportRecord | null };

/** Runs one icon's export job end to end, journalled when a store is present. */
export async function runUploadJob(req: JobRequest, deps: RunnerDeps): Promise<JobResult> {
  if (deps.journal === undefined) return new Job(req, deps).run();
  const trace = jobJournal(deps.journal, req, deps.now);
  await trace.begin();
  const result = await new Job(req, tracedDeps(deps, trace)).run();
  await trace.finish(result);
  return result;
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
