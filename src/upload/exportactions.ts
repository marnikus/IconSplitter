// exportactions.ts — the export actions and their batch runner (design §3.2):
// export the selection or one row, cancel in flight. The batch is sequential
// (local compute), per-item isolated (one icon's failure never touches
// another's package, RULE 5) and cancel-aware; every row's run reports its
// stage, and a committed package clears the row's stale flag. The pipeline
// itself (preflight → prepare → optimize → render → embed → eps → validate →
// atomic commit) lives in runexport + exportstages/validate/commit.

import type { ProcessReporter } from "../lib/processprogress";
import { startUploadProgress } from "./processprogress";
import { useCallback, useRef } from "react";
import { copyFolderText } from "../lib/copypath";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { publishedJpegPath } from "../lib/upload/export";
import type { IconMetadata } from "../lib/upload/meta";
import { rowSettings } from "../lib/upload/decorations";
import { PROVIDER_NAME } from "../lib/upload/gemini";
import { runExport, type ExportRunArgs, type ExportRunResult } from "./runexport";
import { rememberJob } from "./jobstore";
import { loadBridgeConfig } from "./configstore";
import { CONVERTERS } from "../lib/upload/epsconv/registry";
import type { ConverterDeps } from "../lib/upload/epsconv/types";
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
  void copyFolderText(c.refs.root.current as DirHandleLike | null, artifactPathOf(row), c.say);
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
  if (root === null || c.refs.abortExport.current !== null) return;
  const abort = new AbortController();
  c.refs.abortExport.current = abort;
  c.dispatch({ type: "running", kind: "export", n: ids.length });
  const tally = { done: 0, total: ids.length, fixed: 0, failed: 0 };
  const progress = startUploadProgress(c, "export", ids.length);
  try {
    const epsNote = await exportBatchItems({ latest, root, ids, signal: abort.signal, freshMeta, progress, tally });
    progress.finish(abort.signal.aborted ? "cancelled" : "completed");
    c.say(exportBatchLine({ ...tally, aborted: abort.signal.aborted, epsNote }), tally.failed > 0);
  } catch {
    progress.finish("failed");
    c.say("Export batch stopped unexpectedly — finished packages are kept", true);
  } finally {
    finishBatch(c, { ...tally, aborted: abort.signal.aborted });
  }
}

interface ExportBatchWork extends Omit<ExportOneArgs, "id"> {
  ids: string[];
  progress: ProcessReporter;
  tally: { done: number; total: number; fixed: number; failed: number };
}

/** One item's completion drives both the batch summary and shared visual count. */
async function exportBatchItems(work: ExportBatchWork): Promise<string | null> {
  const c = work.latest.current;
  for (const id of work.ids) rememberJob(id, "queued");
  const epsNote = await probeEpsNote(c, work.ids);
  if (epsNote !== null) c.say(epsNote, true);
  for (const id of work.ids) {
    if (work.signal.aborted) break;
    rememberJob(id, "running");
    const outcome = await exportOne({ ...work, id });
    if (outcome.cancelled) break;
    work.tally.fixed += outcome.fixed;
    work.tally.failed += outcome.failed;
    work.tally.done += 1;
    work.progress.advance();
  }
  return epsNote;
}

/** The batch's end: the run flags off, the cancel logged, the one toast line. */
function finishBatch(c: UploadCtx, b: { done: number; total: number; aborted: boolean }): void {
  c.refs.abortExport.current = null;
  c.dispatch({ type: "running", kind: "export", n: 0 });
  if (b.aborted) log(cancelledSpec(b.total - b.done));
}

/** The helper's URL from the device config + the browser's own fetch (2026-10-09). */
function browserConverterDeps(): ConverterDeps {
  return { bridgeUrl: loadBridgeConfig().url, fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init) };
}

/**
 * One probe BEFORE the batch (design 2026-10-09, RULE 9): when rows want the
 * Inkscape EPS and the helper is not usable, say so up front — those rows
 * keep requested SVG/JPEG as partial, or fail when EPS-only. Null = nothing to say.
 */
async function probeEpsNote(c: UploadCtx, ids: string[]): Promise<string | null> {
  const wanting = ids.map((id) => rowSettings(c.m.defaults, id, c.m.overrides, c.m.applied))
    .filter((s) => s.includeEps && s.epsConverter === "inkscape");
  if (wanting.length === 0) return null;
  const state = await CONVERTERS.inkscape.probe(browserConverterDeps());
  if (state.ok) return null;
  const n = wanting.length;
  const outcome = wanting.some((s) => s.includeSvg === false && s.includeJpeg === false)
    ? "cannot write EPS; EPS-only rows fail" : "will be partial";
  return `EPS: ${state.reason} — ${n} row${n === 1 ? "" : "s"} ${outcome} · ${state.fix}`;
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

/** One result: count actual completions, not aborted work; retain EPS-fix summary. */
async function exportOne(args: ExportOneArgs): Promise<{ fixed: number; failed: number; cancelled: boolean }> {
  const c = args.latest.current;
  const row = rowOf(c, args.id);
  if (row === null) return { fixed: 0, failed: 1, cancelled: false };
  c.dispatch({ type: "run", id: args.id, run: { running: "export", stage: "preflight", error: "", note: "" } });
  const overrides = c.m.overrides[args.id] ?? {};
  const meta = acceptedOf(args.freshMeta.get(args.id) ?? row.meta);
  const result = await runExport({
    root: args.root, row: row.source,
    settings: rowSettings(c.m.defaults, args.id, c.m.overrides, c.m.applied),
    defaults: c.m.defaults, overrides,
    metadata: meta === null ? null : meta.metadata,
    metadataInfo: metadataInfoOf(c, meta),
    record: row.record, signal: args.signal,
    deps: { converter: browserConverterDeps() },
  });
  applyExportResult(args.latest, args.id, row, result);
  return { fixed: result.notes.length > 0 ? 1 : 0, failed: result.status === "failed" ? 1 : 0, cancelled: result.status === "cancelled" };
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
