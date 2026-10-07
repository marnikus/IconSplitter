// metaactions.ts — the metadata-generation actions and their batch runner
// (design §3.2): request (guarded, confirmed against the exact request),
// confirm/cancel, accept (re-validates, persists via the embed commit) and edit.
// The batch runs with bounded concurrency, per-item isolation and an abort the
// cancel action owns; in-flight requests are journalled, so a restart reports
// them interrupted and never resends them (I-20).

import { useCallback, useRef } from "react";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { validateMetadata, type IconMetadata } from "../lib/upload/meta";
import { readSvgText } from "../svg/svgfiles";
import { generateMetadata, type MetadataResult } from "./runmetadata";
import { rememberMeta } from "./metacache";
import { namedSpec, nameRefusedSpec, type IconRef } from "./uploadlog";
import type { Latest, UploadMetaState, UploadRow } from "./types";
import type { UploadActions, UploadCtx } from "./actions";
import { rowOf, runExportBatch } from "./exportactions";

/** The metadata hooks' share of the action surface (composition stays typed). */
type MetaSlice = Pick<UploadActions,
  "requestMetadata" | "confirmMetadata" | "cancelMetadata" | "acceptMetadata" | "editMetadata">;

export function useMetaActions(ctx: UploadCtx): MetaSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  return { ...useMetaRequestActions(latest), ...useMetaEditActions(latest) };
}

// --- request + cancel ------------------------------------------------------------

function useMetaRequestActions(latest: Latest): Pick<MetaSlice,
  "requestMetadata" | "confirmMetadata" | "cancelMetadata"> {
  const requestMetadata = useCallback((ids: string[]) => {
    const c = latest.current;
    const why = metaGuard(c, ids);
    if (why !== null) return c.say(why, true);
    c.dispatch({ type: "dialog", dialog: { kind: "meta", ids } });
  }, [latest]);
  const confirmMetadata = useCallback(() => {
    const c = latest.current;
    const dialog = c.m.dialog;
    if (dialog === null || dialog.kind !== "meta") return;
    c.dispatch({ type: "dialog", dialog: null });
    void runMetadataBatch(latest, dialog.ids);
  }, [latest]);
  const cancelMetadata = useCallback(() => {
    const c = latest.current;
    if (c.refs.abortMeta.current === null) return;
    c.refs.abortMeta.current.abort();
    c.say("Cancelling — finished results are kept");
  }, [latest]);
  return { requestMetadata, confirmMetadata, cancelMetadata };
}

/** Why a metadata batch cannot start right now, or null when it can. */
function metaGuard(c: UploadCtx, ids: string[]): string | null {
  if (ids.length === 0) return "Select at least one icon first";
  if (c.refs.root.current === null) return "Open a folder first";
  if (c.refs.key.current === null || c.refs.key.current.trim() === "") return "No Gemini API key — add one in the provider card";
  if (c.m.runningMeta > 0) return "A metadata request is already in flight — cancel it or wait";
  return null;
}

// --- accept + edit ----------------------------------------------------------------

function useMetaEditActions(latest: Latest): Pick<MetaSlice, "acceptMetadata" | "editMetadata"> {
  const acceptMetadata = useCallback((id: string) => {
    const c = latest.current;
    const row = rowOf(c, id);
    if (row === null || row.meta.metadata === null) return c.say("Nothing to accept — generate metadata first", true);
    const validation = validateMetadata(row.meta.metadata);
    if (!validation.ok) {
      c.dispatch({ type: "meta", id, meta: { ...row.meta, validation } });
      return c.say(validation.errors.join("; "), true);
    }
    c.dispatch({ type: "meta", id, meta: { ...row.meta, state: "accepted", validation, edited: false } });
    // Accepted here, remembered for the fingerprint: the next session (or a
    // crash) never pays for this source again (CP-15).
    rememberMeta(row.sourceHash ?? "", { state: "accepted", meta: row.meta.metadata });
    log(namedSpec({ ...refOf(row), model: c.m.gemini.model, tags: row.meta.metadata.tags.length }));
    c.say("Metadata accepted");
    // The acceptance persists in export.json: a committed record re-embeds (no
    // AI, no render); a never-exported row keeps it until its first export.
    if (row.record !== null) void runExportBatch(latest, [id]);
  }, [latest]);
  const editMetadata = useCallback((id: string, patch: Partial<IconMetadata>) => {
    const c = latest.current;
    const row = rowOf(c, id);
    if (row === null || row.meta.metadata === null) return;
    c.dispatch({ type: "meta", id, meta: { ...row.meta, metadata: { ...row.meta.metadata, ...patch }, edited: true } });
  }, [latest]);
  return { acceptMetadata, editMetadata };
}

// --- the batch ---------------------------------------------------------------------

/** One metadata batch: bounded concurrency, per-item isolation, cancel-aware. */
async function runMetadataBatch(latest: Latest, ids: string[]): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  const key = c.refs.key.current;
  if (root === null || key === null) return;
  const abort = new AbortController();
  c.refs.abortMeta.current = abort;
  c.dispatch({ type: "running", kind: "metadata", n: ids.length });
  const tally = { done: 0, ok: 0, total: ids.length };
  c.dispatch({ type: "progress", progress: { done: 0, total: tally.total } });
  const ctx: MetaRunCtx = { latest, root, key, queue: [...ids], signal: abort.signal, tally };
  const width = Math.max(1, Math.min(c.m.gemini.concurrency, ids.length));
  await Promise.all(Array.from({ length: width }, () => drainMeta(ctx)));
  c.refs.abortMeta.current = null;
  c.dispatch({ type: "running", kind: "metadata", n: 0 });
  c.dispatch({ type: "progress", progress: null });
  c.say(`Metadata ready for ${tally.ok} of ${ids.length} icon${ids.length === 1 ? "" : "s"}`);
}

/** Everything the workers share — one domain object (RULE 16). */
interface MetaRunCtx {
  latest: Latest;
  root: DirHandleLike;
  key: string;
  queue: string[];
  signal: AbortSignal;
  tally: { done: number; ok: number; total: number };
}

async function drainMeta(ctx: MetaRunCtx): Promise<void> {
  while (ctx.queue.length > 0 && !ctx.signal.aborted) {
    const id = ctx.queue.shift();
    if (id === undefined) return;
    // The batch tallies its own outcomes: the context re-renders asynchronously,
    // so reading the rows back here would report the pre-run state.
    if (await metaOne(ctx, id)) ctx.tally.ok += 1;
    ctx.tally.done += 1;
    ctx.latest.current.dispatch({ type: "progress", progress: { done: ctx.tally.done, total: ctx.tally.total } });
  }
}

/** One icon's request; true when the answer landed (valid or fixable-invalid). */
async function metaOne(ctx: MetaRunCtx, id: string): Promise<boolean> {
  const c = ctx.latest.current;
  const row = rowOf(c, id);
  if (row === null) return false;
  c.dispatch({ type: "meta", id, meta: { ...row.meta, state: "pending", detail: "" } });
  c.dispatch({ type: "run", id, run: { running: "metadata" } });
  const svgText = await readSvgText(ctx.root, row.source.svgPath);
  if (svgText === null) return unreadable(c, id, row.meta);
  const result = await generateMetadata({
    rowId: id, svgText, config: c.m.gemini, apiKey: ctx.key, signal: ctx.signal,
    deps: { journal: c.refs.journal.current },
  });
  applyMetaResult(ctx.latest, id, row.meta, result);
  return result.outcome === "generated" || result.outcome === "invalid";
}

/** The source could not be read: the row keeps its prior metadata, honestly. */
function unreadable(c: UploadCtx, id: string, meta: UploadMetaState): boolean {
  c.dispatch({ type: "meta", id, meta: { ...meta, detail: "the source SVG could not be read" } });
  c.dispatch({ type: "run", id, run: { running: null } });
  return false;
}

/** The run's outcome → the row's metadata state; a failure keeps the prior text. */
function applyMetaResult(latest: Latest, id: string, base: UploadMetaState, result: MetadataResult): void {
  const c = latest.current;
  const row = rowOf(c, id);
  c.dispatch({ type: "meta", id, meta: metaFromResult(base, result) });
  c.dispatch({ type: "run", id, run: { running: null } });
  if (row === null) return;
  const ref = refOf(row);
  if (result.metadata === null) {
    if (result.outcome === "failed" || result.outcome === "cancelled") log(nameRefusedSpec({ ...ref, why: result.detail }));
    return;
  }
  // A produced answer is paid work: remember it (unaccepted) under the
  // fingerprint so a crash before acceptance cannot buy it twice (CP-15).
  rememberMeta(row.sourceHash ?? "", { state: "generated", meta: result.metadata });
  log(result.outcome === "generated"
    ? namedSpec({ ...ref, model: c.m.gemini.model, tags: result.metadata.tags.length })
    : nameRefusedSpec({ ...ref, why: result.detail }));
}

/** The log's identifying half, straight off the row's source. */
function refOf(row: UploadRow): IconRef {
  return { id: row.source.id, base: row.source.base };
}

function metaFromResult(base: UploadMetaState, result: MetadataResult): UploadMetaState {
  if (result.metadata === null) {
    return { ...base, detail: result.detail, usage: result.usage };
  }
  return {
    state: result.outcome === "generated" ? "generated" : "invalid",
    metadata: result.metadata,
    validation: result.validation,
    usage: result.usage,
    detail: result.detail,
    edited: false,
  };
}
