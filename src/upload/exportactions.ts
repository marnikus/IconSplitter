// exportactions.ts — the export actions and their batch runner (design §3.2):
// export the selection or one row, cancel in flight. The batch is sequential
// (local compute), per-item isolated (one icon's failure never touches
// another's package, RULE 5) and cancel-aware; every row's run reports its
// stage, and a committed package clears the row's stale flag. The pipeline
// itself (preflight → prepare → optimize → render → embed → eps → validate →
// atomic commit) lives in runexport + exportstages/validate/commit.

import { useCallback, useRef } from "react";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { effectiveSettings } from "../lib/upload/settings";
import { DEFAULT_METADATA_PROMPT } from "../lib/upload/meta";
import { PROVIDER_NAME } from "../lib/upload/gemini";
import { runExport, type ExportRunArgs, type ExportRunResult } from "./runexport";
import { rememberJob } from "./jobstore";
import { cancelledSpec, exportedSpec, type IconRef } from "./uploadlog";
import type { Latest, UploadRow } from "./types";
import type { UploadRunUpdate } from "./statemodel";
import type { UploadActions, UploadCtx } from "./actions";

/** The export hooks' share of the action surface (composition stays typed). */
type ExportSlice = Pick<UploadActions, "exportRows" | "exportRow" | "cancelExport">;

export function useExportActions(ctx: UploadCtx): ExportSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const exportRows = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = exportGuard(c, ids);
    if (why !== null) return c.say(why, true);
    void runExportBatch(latest, ids);
  }, [latest]);
  const exportRow = useCallback((id: string) => {
    const c = latest.current;
    const why = exportGuard(c, [id]);
    if (why !== null) return c.say(why, true);
    void runExportBatch(latest, [id]);
  }, [latest]);
  const cancelExport = useCallback(() => {
    const c = latest.current;
    if (c.refs.abortExport.current === null) return;
    c.refs.abortExport.current.abort();
    c.say("Cancelling — finished packages are kept");
  }, [latest]);
  return { exportRows, exportRow, cancelExport };
}

/** Why an export batch cannot start right now, or null when it can. */
function exportGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.runningExport > 0) return "An export is already in flight — cancel it or wait";
  return null;
}

/** One export batch: sequential, per-item isolated, cancel-aware (RULE 5/7). */
export async function runExportBatch(latest: Latest, ids: string[]): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return;
  const abort = new AbortController();
  c.refs.abortExport.current = abort;
  c.dispatch({ type: "running", kind: "export", n: ids.length });
  const tally = { done: 0, total: ids.length };
  c.dispatch({ type: "progress", progress: { ...tally } });
  for (const id of ids) rememberJob(id, "queued");
  for (const id of ids) {
    if (abort.signal.aborted) break;
    rememberJob(id, "running");
    await exportOne({ latest, root, id, signal: abort.signal });
    tally.done += 1;
    c.dispatch({ type: "progress", progress: { ...tally } });
  }
  c.refs.abortExport.current = null;
  c.dispatch({ type: "running", kind: "export", n: 0 });
  c.dispatch({ type: "progress", progress: null });
  const done = tally.done;
  if (abort.signal.aborted) log(cancelledSpec(ids.length - done));
  c.say(abort.signal.aborted
    ? `Export stopped after ${done} of ${ids.length} — finished packages are kept`
    : `Exported ${done} icon${done === 1 ? "" : "s"} — each pair's export folder holds the package`);
}

/** Everything one export run needs — one domain object (RULE 16). */
interface ExportOneArgs {
  latest: Latest;
  root: DirHandleLike;
  id: string;
  signal: AbortSignal;
}

async function exportOne(args: ExportOneArgs): Promise<void> {
  const c = args.latest.current;
  const row = rowOf(c, args.id);
  if (row === null) return;
  c.dispatch({ type: "run", id: args.id, run: { running: "export", stage: "preflight", error: "" } });
  const overrides = c.m.overrides[args.id] ?? {};
  const result = await runExport({
    root: args.root, row: row.source,
    settings: effectiveSettings(c.m.defaults, overrides),
    defaults: c.m.defaults, overrides,
    metadata: row.meta.state === "accepted" ? row.meta.metadata : null,
    metadataInfo: metadataInfoOf(c, row),
    record: row.record, signal: args.signal,
  });
  applyExportResult(args.latest, args.id, row, result);
}

/** The metadata block's provenance, when the row carries accepted metadata. */
function metadataInfoOf(c: UploadCtx, row: UploadRow): ExportRunArgs["metadataInfo"] {
  if (row.meta.state !== "accepted" || row.meta.validation === null) return null;
  return {
    prompt: DEFAULT_METADATA_PROMPT, provider: PROVIDER_NAME, model: c.m.gemini.model,
    requestId: null, usage: row.meta.usage, validation: row.meta.validation,
  };
}

function applyExportResult(latest: Latest, id: string, row: UploadRow, result: ExportRunResult): void {
  const c = latest.current;
  const committed = result.status === "processed" || result.status === "partial";
  const run: UploadRunUpdate = {
    running: null, stage: null,
    status: result.status, record: result.record,
    error: result.error?.detail ?? "",
    stale: committed ? false : row.stale,
  };
  c.dispatch({ type: "run", id, run });
  rememberJob(id, result.status);
  const ref: IconRef = { id: row.source.id, base: row.source.base };
  log(exportedSpec({ ...ref, status: result.status, note: run.error || noteForStatus(result.status) }));
}

/** The one-line note an entry carries when the run reported no failure detail. */
function noteForStatus(status: ExportRunResult["status"]): string {
  if (status === "processed") return "export.json was written last; the approved source is untouched";
  if (status === "partial") return "the required outputs committed; the optional EPS stage failed";
  if (status === "cancelled") return "stopped before commit; the previous package is intact";
  return "nothing was committed";
}

/** The live row a run is about — read fresh, never a stale snapshot. */
export function rowOf(c: UploadCtx, id: string): UploadRow | null {
  return c.rows.find((r) => r.source.id === id) ?? null;
}
