// exportactions.ts — the export actions and their batch runner (design §3.2):
// export the selection or one row, cancel in flight. The batch is sequential
// (local compute), per-item isolated (one icon's failure never touches
// another's package, RULE 5) and cancel-aware; every row's run reports its
// stage, and a committed package clears the row's stale flag. The pipeline
// itself (preflight → prepare → optimize → render → embed → eps → validate →
// atomic commit) lives in runexport + exportstages/validate/commit.

import { useCallback, useRef } from "react";
import { copyFolderText } from "../lib/copypath";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { publishedJpegPath } from "../lib/upload/export";
import type { IconMetadata } from "../lib/upload/meta";
import { effectiveSettings } from "../lib/upload/settings";
import { PROVIDER_NAME } from "../lib/upload/gemini";
import { runExport, type ExportRunArgs, type ExportRunResult } from "./runexport";
import { loopbackHost } from "../lib/upload/epsconvert/host";
import { rememberJob } from "./jobstore";
import { cancelledSpec, exportBatchLine, exportOutcomeNote, exportedSpec, type IconRef } from "./uploadlog";
import { noteOfRecord } from "./rowmodel";
import type { Latest, UploadMetaState, UploadRow } from "./types";
import type { UploadRunUpdate } from "./statemodel";
import type { UploadActions, UploadCtx } from "./actions";

/** The export hooks' share of the action surface (composition stays typed). */
type ExportSlice = Pick<UploadActions, "exportRows" | "exportRow" | "cancelExport" | "openLocation">;

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
  const openLocation = useCallback((id: string) => {
    void copyLocation(latest.current, id);
  }, [latest]);
  return { exportRows, exportRow, cancelExport, openLocation };
}

/**
 * The same code the Generate SVG tab's Location uses: the browser cannot launch
 * Explorer, so the folder that will hold the package is COPIED, and the toast
 * says so. The committed artifact names the folder when there is one; the
 * planned package path names it before the first export.
 */
function copyLocation(c: UploadCtx, id: string): void {
  const row = rowOf(c, id);
  if (row === null) return;
  void copyFolderText(c.m.rootName, artifactPathOf(row), c.say);
}

/** The file that decides which folder a copy names: committed first, plan second. */
function artifactPathOf(row: UploadRow): string {
  return row.record?.outputs.jpg?.path ?? publishedJpegPath(row.source.dirPath, row.source.svgName);
}

/** Why an export batch cannot start right now, or null when it can. */
function exportGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.m.runningExport > 0) return "An export is already in flight — cancel it or wait";
  return null;
}

/**
 * One export batch: sequential, per-item isolated, cancel-aware (RULE 5/7).
 *
 * `freshMeta` carries metadata an action accepted moments ago in THIS task
 * (the "Export selected" flow): React may not have committed that dispatch to
 * `latest.current` yet, and reading the row would export the previous — metadata
 * free — state. The map is the truth the run was promised, so it wins.
 */
export async function runExportBatch(
  latest: Latest,
  ids: string[],
  freshMeta: ReadonlyMap<string, UploadMetaState> = new Map(),
): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return;
  const abort = new AbortController();
  c.refs.abortExport.current = abort;
  c.dispatch({ type: "running", kind: "export", n: ids.length });
  const tally = { done: 0, total: ids.length };
  let fixed = 0;
  c.dispatch({ type: "progress", progress: { ...tally } });
  for (const id of ids) rememberJob(id, "queued");
  for (const id of ids) {
    if (abort.signal.aborted) break;
    rememberJob(id, "running");
    fixed += await exportOne({ latest, root, id, signal: abort.signal, freshMeta });
    tally.done += 1;
    c.dispatch({ type: "progress", progress: { ...tally } });
  }
  c.refs.abortExport.current = null;
  c.dispatch({ type: "running", kind: "export", n: 0 });
  c.dispatch({ type: "progress", progress: null });
  const done = tally.done;
  if (abort.signal.aborted) log(cancelledSpec(ids.length - done));
  c.say(exportBatchLine({ done, total: ids.length, aborted: abort.signal.aborted, fixed }));
}

/** Everything one export run needs — one domain object (RULE 16). */
interface ExportOneArgs {
  latest: Latest;
  root: DirHandleLike;
  id: string;
  signal: AbortSignal;
  /** Answers accepted in this task, before React re-rendered (see the batch). */
  freshMeta: ReadonlyMap<string, UploadMetaState>;
}

/** Runs one export; resolves 1 when its EPS was auto-fixed (the batch toast counts them), else 0. */
async function exportOne(args: ExportOneArgs): Promise<number> {
  const c = args.latest.current;
  const row = rowOf(c, args.id);
  if (row === null) return 0;
  c.dispatch({ type: "run", id: args.id, run: { running: "export", stage: "preflight", error: "", note: "" } });
  const overrides = c.m.overrides[args.id] ?? {};
  const meta = acceptedOf(args.freshMeta.get(args.id) ?? row.meta);
  const result = await runExport({
    root: args.root, row: row.source,
    settings: effectiveSettings(c.m.defaults, overrides),
    defaults: c.m.defaults, overrides,
    metadata: meta === null ? null : meta.metadata,
    metadataInfo: metadataInfoOf(c, meta),
    record: row.record, signal: args.signal,
    deps: { cli: loopbackHost() },
  });
  applyExportResult(args.latest, args.id, row, result);
  return result.notes.length > 0 ? 1 : 0;
}

/** The accepted state an export may carry, or null when there is nothing to embed. */
function acceptedOf(meta: UploadMetaState): (UploadMetaState & { metadata: IconMetadata }) | null {
  return meta.state === "accepted" && meta.metadata !== null ? meta as UploadMetaState & { metadata: IconMetadata } : null;
}

/** The metadata block's provenance, when the run carries accepted metadata. */
function metadataInfoOf(c: UploadCtx, meta: (UploadMetaState & { metadata: IconMetadata }) | null): ExportRunArgs["metadataInfo"] {
  if (meta === null || meta.validation === null) return null;
  return {
    prompt: c.m.prompt, provider: PROVIDER_NAME, model: c.m.gemini.model,
    requestId: null, usage: meta.usage, validation: meta.validation,
  };
}

function applyExportResult(latest: Latest, id: string, row: UploadRow, result: ExportRunResult): void {
  const c = latest.current;
  const committed = result.status === "processed" || result.status === "partial";
  const run: UploadRunUpdate = {
    running: null, stage: null,
    status: result.status, record: result.record,
    error: result.error?.detail ?? "",
    note: noteOfRecord(result.record),
    stale: committed ? false : row.stale,
  };
  c.dispatch({ type: "run", id, run });
  rememberJob(id, result.status);
  const ref: IconRef = { id: row.source.id, base: row.source.base };
  log(exportedSpec({ ...ref, status: result.status, note: exportOutcomeNote({ status: result.status, error: run.error ?? "", notes: result.notes }) }));
}

/** The live row a run is about — read fresh, never a stale snapshot. */
export function rowOf(c: UploadCtx, id: string): UploadRow | null {
  return c.rows.find((r) => r.source.id === id) ?? null;
}
