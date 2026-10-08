// metaactions.ts — the metadata-generation actions and their batch runner
// (design §3.2): request (guarded, confirmed against the exact request),
// confirm/cancel, accept (re-validates, persists via the embed commit) and edit.
// The batch runs with bounded concurrency, per-item isolation and an abort the
// cancel action owns; in-flight requests are journalled, so a restart reports
// them interrupted and never resends them (I-20). The SELECTION-level buttons
// ("Generate metadata" / "Export selected") and the confirmation they open live
// in `metaselect.ts`.

import { useCallback, useRef } from "react";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { validateMetadata, type IconMetadata } from "../lib/upload/meta";
import { previewFor, type SentPreview } from "../lib/upload/sentpreview";
import { readSvgText } from "../svg/svgfiles";
import { generateMetadata, type MetadataResult } from "./runmetadata";
import { rememberMeta } from "./metacache";
import { namedSpec, nameRefusedSpec, type IconRef } from "./uploadlog";
import type { Latest, UploadMetaState, UploadRow } from "./types";
import type { UploadActions, UploadCtx } from "./actions";
import { rowOf, runExportBatch } from "./exportactions";
import { openMetaDialog, useMetaSelectionActions } from "./metaselect";

/** The metadata hooks' share of the action surface (composition stays typed). */
type MetaSlice = Pick<UploadActions,
  "requestMetadata" | "generateMetadataSelected" | "exportSelected"
  | "confirmMetadata" | "cancelMetadata" | "acceptMetadata" | "editMetadata">;

export function useMetaActions(ctx: UploadCtx): MetaSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  return { ...useMetaRequestActions(latest), ...useMetaSelectionActions(latest), ...useMetaEditActions(latest) };
}

// --- request + cancel ------------------------------------------------------------

function useMetaRequestActions(latest: Latest): Pick<MetaSlice,
  "requestMetadata" | "confirmMetadata" | "cancelMetadata"> {
  const requestMetadata = useCallback((ids: string[]) => {
    openMetaDialog(latest, ids, []);
  }, [latest]);
  const confirmMetadata = useCallback(() => {
    const c = latest.current;
    const dialog = c.m.dialog;
    if (dialog === null || dialog.kind !== "meta") return;
    const previews = dialog.previews;
    const thenExport = dialog.thenExport;
    c.dispatch({ type: "dialog", dialog: null });
    void runMetadataBatch(latest, dialog.ids, previews, { acceptValid: thenExport.length > 0, thenExport });
  }, [latest]);
  const cancelMetadata = useCallback(() => {
    const c = latest.current;
    if (c.refs.abortMeta.current === null) return;
    c.refs.abortMeta.current.abort();
    c.say("Cancelling — finished results are kept");
  }, [latest]);
  return { requestMetadata, confirmMetadata, cancelMetadata };
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

/** What the batch does beyond producing answers (RULE 3: one place that decides). */
interface MetaBatchOptions {
  /**
   * Accept every answer that PASSES the policy the moment it lands (unedited,
   * machine-produced). "Export selected" sets this: it promised metadata in the
   * package, and an unaccepted draft is never exportable.
   */
  acceptValid?: boolean;
  /** The whole selection to export once the answers are in (empty = none). */
  thenExport?: string[];
}

/** One metadata batch: bounded concurrency, per-item isolation, cancel-aware. */
async function runMetadataBatch(
  latest: Latest,
  ids: string[],
  previews: readonly SentPreview[] = [],
  opts: MetaBatchOptions = {},
): Promise<void> {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  const key = c.refs.key.current;
  if (root === null || key === null) return;
  const abort = new AbortController();
  c.refs.abortMeta.current = abort;
  c.dispatch({ type: "running", kind: "metadata", n: ids.length });
  const tally = { done: 0, ok: 0, total: ids.length };
  c.dispatch({ type: "progress", progress: { done: 0, total: tally.total } });
  const ctx: MetaRunCtx = {
    latest, root, key, queue: [...ids], previews,
    signal: abort.signal, tally, accept: opts.acceptValid === true, accepted: new Map(),
  };
  const width = Math.max(1, Math.min(c.m.gemini.concurrency, ids.length));
  await Promise.all(Array.from({ length: width }, () => drainMeta(ctx)));
  c.refs.abortMeta.current = null;
  c.dispatch({ type: "running", kind: "metadata", n: 0 });
  c.dispatch({ type: "progress", progress: null });
  const accepted = opts.acceptValid === true ? ` — ${tally.ok} accepted` : "";
  c.say(`Metadata ready for ${tally.ok} of ${ids.length} icon${ids.length === 1 ? "" : "s"}${accepted}`);
  await exportAfterMetadata(latest, opts, ctx.accepted);
}

/**
 * The promised second half of "Export selected": the WHOLE selection, so an
 * icon that already had metadata is exported just like the fresh ones — with
 * the run's own accepted states, which React has not re-rendered yet (RULE 24).
 */
function exportAfterMetadata(
  latest: Latest, opts: MetaBatchOptions, accepted: ReadonlyMap<string, UploadMetaState>,
): Promise<void> {
  const then = opts.thenExport ?? [];
  return then.length > 0 ? runExportBatch(latest, then, accepted) : Promise.resolve();
}

/** Everything the workers share — one domain object (RULE 16). */
interface MetaRunCtx {
  latest: Latest;
  root: DirHandleLike;
  key: string;
  queue: string[];
  /** The images the confirmation showed, keyed by row id + source revision. */
  previews: readonly SentPreview[];
  signal: AbortSignal;
  tally: { done: number; ok: number; total: number };
  /** Accept each valid answer as it lands (the "then export" flow). */
  accept: boolean;
  /** What this run accepted, keyed by row id — the export's own truth. */
  accepted: Map<string, UploadMetaState>;
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
  // The image the confirmation showed for THIS icon and THIS source revision is
  // sent unchanged; when there is none (or the file changed since), the runner
  // renders that icon's own SVG here instead of sending a stranger's picture.
  const prepared = previewFor(ctx.previews, id, row.source.fingerprint);
  const result = await generateMetadata({
    rowId: id, svgText, config: c.m.gemini, apiKey: ctx.key, signal: ctx.signal,
    // The prompt the editor shows is the prompt that is sent (and, later, the
    // prompt the export record names) — never a default the user cannot see.
    prompt: c.m.prompt,
    ...(prepared === null ? {} : { image: prepared.image }),
    deps: { journal: c.refs.journal.current },
  });
  applyMetaResult(ctx.latest, id, row.meta, result);
  const validation = result.validation;
  if (ctx.accept && result.outcome === "generated" && validation !== null && validation.ok) {
    acceptNow(ctx, id, result);
  }
  return result.outcome === "generated" || result.outcome === "invalid";
}

/** The source could not be read: the row keeps its prior metadata, honestly. */
function unreadable(c: UploadCtx, id: string, meta: UploadMetaState): boolean {
  c.dispatch({ type: "meta", id, meta: { ...meta, detail: "the source SVG could not be read" } });
  c.dispatch({ type: "run", id, run: { running: null } });
  return false;
}

/**
 * The acceptance the "then export" flow performs: a valid, unedited,
 * machine-produced answer, stored exactly as the Accept button stores it (same
 * state, same remembered fingerprint) — the user asked for a package that
 * CARRIES the metadata, and a draft is never exportable.
 */
function acceptNow(ctx: MetaRunCtx, id: string, result: MetadataResult): void {
  const c = ctx.latest.current;
  const row = rowOf(c, id);
  if (row === null || result.metadata === null || result.validation === null) return;
  const meta: UploadMetaState = {
    state: "accepted", metadata: result.metadata, validation: result.validation,
    usage: result.usage, detail: result.detail, edited: false,
  };
  c.dispatch({ type: "meta", id, meta });
  // The dispatch above is not readable from `latest.current` until React
  // re-renders, and the export of THIS task runs before that — so the answer
  // travels with the run instead of being looked up again (RULE 24).
  ctx.accepted.set(id, meta);
  rememberMeta(row.sourceHash ?? "", { state: "accepted", meta: result.metadata });
  log(namedSpec({ ...refOf(row), model: c.m.gemini.model, tags: result.metadata.tags.length }));
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
