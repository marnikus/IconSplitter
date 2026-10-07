// run.ts — running the export for the icons a person selected (RULE 10/14).
// Owns: turning a row plus the chosen settings into one pipeline call, wiring the
// real file system, and running many rows with bounded concurrency where one
// failure never touches another icon's package.
//
// Nothing here decides policy: the plan (what to rebuild), the record (what was
// built) and the staging rules all live in tested lib modules.

import type { DirHandleLike } from "../lib/fs";
import { hashText } from "../lib/uploadrecord";
import type { ExportRecord } from "../lib/uploadrecord";
import { runPipeline, type PipelineDeps, type PipelineRun } from "../lib/uploadpipeline";
import type { OverrideMap } from "../lib/uploadoverride";
import type { UploadSettings } from "../lib/uploadsettings";
import { validateMetadata, type MetadataRecord } from "../lib/uploadmeta";
import { runPool } from "../lib/uploadjobs";
import { exportDir, readApprovedSvg, readExisting, readRecord, stagingDir, stagedWriter } from "./runfs";
import type { UploadRow } from "./rows";

export interface RunContext {
  root: DirHandleLike;
  settings: UploadSettings;
  overrides: OverrideMap;
  /** The metadata accepted for this row; null when none has been accepted. */
  metadataOf: (row: UploadRow) => MetadataRecord | null;
  wants: { svg: boolean; jpeg: boolean; eps: boolean };
  raster: PipelineDeps["raster"];
  eps: PipelineDeps["eps"];
  verifyEps: PipelineDeps["verifyEps"];
  log: (entry: { stage: string; message: string; level?: "info" | "warn" | "error" }) => void;
  signal: AbortSignal;
  now: () => string;
  /** How many icons run at once; the pipeline is CPU- and disk-bound. */
  limit?: number;
}

export interface RowRun {
  row: UploadRow;
  run: PipelineRun | null;
  error: string | null;
}

/** One icon, end to end. The record it publishes is the only truth it leaves. */
export async function runRow(row: UploadRow, ctx: RunContext): Promise<RowRun> {
  if (row.svgPath === null) return { row, run: null, error: "this icon has no approved SVG to export" };
  const loaded = row.code !== null ? { code: row.code } : await readApprovedSvg(ctx.root, row.svgPath);
  if (loaded === null) return { row, run: null, error: "the approved SVG is missing from disk" };
  const dir = await exportDir(ctx.root, row.dirPath);
  const writer = stagedWriter(dir, await stagingDir(ctx.root, row.dirPath));
  const existing = await readExisting(dir, row.stem, row.record);
  const input = await pipelineInput(row, ctx, { code: loaded.code, existing });
  const run = await runPipeline(input, deps(ctx, writer));
  return { row, run, error: run.error };
}

/** One place builds the pipeline's input, so a field cannot be filled twice. */
async function pipelineInput(
  row: UploadRow,
  ctx: RunContext,
  loaded: { code: string; existing: Awaited<ReturnType<typeof readExisting>> },
) {
  const metadata = ctx.metadataOf(row);
  return {
    source: {
      id: row.id,
      name: row.stem,
      path: row.svgPath ?? row.relPath,
      code: loaded.code,
      hash: hashText(loaded.code),
      version: row.version ?? "approved",
    },
    record: row.record,
    settings: ctx.settings,
    override: ctx.overrides[row.id] ?? {},
    metadata: metadata ?? { title: "", description: "", tags: [] },
    metadataCheck: metadata === null ? null : validateMetadata(metadata),
    want: ctx.wants,
    existing: loaded.existing,
    createdAt: ctx.now(),
  };
}

function deps(ctx: RunContext, writer: ReturnType<typeof stagedWriter>): PipelineDeps {
  return {
    write: writer.write,
    commit: writer.commit,
    discard: writer.discard,
    raster: ctx.raster,
    eps: ctx.eps,
    verifyEps: ctx.verifyEps,
    log: ctx.log,
    signal: ctx.signal,
    now: ctx.now,
  };
}

export interface BulkRun {
  /** One entry per icon the run really attempted, in list order. */
  finished: RowRun[];
  failed: number;
  cancelled: number;
  aborted: boolean;
}

/** Runs the selected rows. A failure is reported against its own row, never thrown. */
export async function runRows(rows: readonly UploadRow[], ctx: RunContext): Promise<BulkRun> {
  const byId = new Map<string, RowRun>();
  const pool = await runPool(rows, {
    limit: ctx.limit ?? 2,
    signal: ctx.signal,
    worker: async (row) => {
      const outcome = await runRow(row, ctx);
      byId.set(row.id, outcome);
      if (outcome.error !== null) throw new Error(outcome.error); // the pool records it
    },
  });
  const finished = rows.flatMap((row) => {
    const found = byId.get(row.id);
    return found === undefined ? [] : [found];
  });
  return { finished, failed: pool.failed.length, cancelled: pool.cancelled.length, aborted: pool.aborted };
}

/** Reads the icon's package record, so the list can show what already exists. */
export async function loadRecord(row: UploadRow, root: DirHandleLike): Promise<ExportRecord | null> {
  const dir = await exportDir(root, row.dirPath);
  return readRecord(dir);
}

/** Reads the approved SVG once, for the preview and the metadata request. */
export async function loadCode(row: UploadRow, root: DirHandleLike): Promise<{ code: string; version: string } | null> {
  if (row.svgPath === null) return null;
  const loaded = await readApprovedSvg(root, row.svgPath);
  return loaded === null ? null : { code: loaded.code, version: row.version ?? "approved" };
}
