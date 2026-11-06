// The bounded metadata batch: real runner outcomes publish reusable progress.
import { metadataRights } from "../lib/upload/rights";
import { metadataFingerprint } from "../lib/upload/meta";
import type { UploadCtx } from "./actions";
import { log } from "../log/logstore";
import type { DirHandleLike } from "../lib/fs";
import { previewFor, type SentPreview } from "../lib/upload/sentpreview";
import { readSvgText } from "../svg/svgfiles";
import { generateMetadata, type MetadataResult } from "./runmetadata";
import { rememberMeta } from "./metacache";
import { namedSpec, nameRefusedSpec, type IconRef } from "./uploadlog";
import type { Latest, UploadMetaState, UploadRow } from "./types";
import { rowOf, runExportBatch } from "./exportactions";
import { startUploadProgress } from "./processprogress";
import type { ProcessReporter, ProcessStatus } from "../lib/processprogress";

// --- the batch ---------------------------------------------------------------------

/** What the batch does beyond producing answers (RULE 3: one place that decides). */
interface MetaBatchOptions {
  /** The whole selection to export once the answers are in (empty = none). */
  thenExport?: string[];
}

/** One metadata batch: bounded concurrency, per-item isolation, cancel-aware. */
export async function runMetadataBatch(
  latest: Latest,
  ids: string[],
  previews: readonly SentPreview[] = [],
  opts: MetaBatchOptions = {},
): Promise<void> {
  const ctx = prepareMetadataRun(latest, ids, previews);
  if (ctx === null) return;
  let status: Exclude<ProcessStatus, "running"> = "failed";
  try {
    const width = Math.max(1, Math.min(latest.current.m.gemini.concurrency, ids.length));
    const outcomes = await Promise.allSettled(Array.from({ length: width }, () => drainMeta(ctx)));
    if (outcomes.some((outcome) => outcome.status === "rejected")) throw new Error("Metadata worker stopped");
    status = ctx.signal.aborted ? "cancelled" : "completed";
  } catch {
    latest.current.say("Metadata batch stopped unexpectedly — finished results are kept", true);
  } finally {
    await finishMetadataRun(ctx, opts, status);
  }
}

/** Capture the batch's inputs and publish zero before the first asynchronous work. */
function prepareMetadataRun(latest: Latest, ids: string[], previews: readonly SentPreview[]): MetaRunCtx | null {
  const c = latest.current;
  const root = c.refs.root.current as DirHandleLike | null;
  const key = c.refs.key.current;
  if (root === null || key === null || c.refs.abortMeta.current !== null) return null;
  const abort = new AbortController();
  c.refs.abortMeta.current = abort;
  c.dispatch({ type: "running", kind: "metadata", n: ids.length });
  return {
    latest, root, key, queue: [...ids], previews, signal: abort.signal,
    tally: { done: 0, ok: 0, total: ids.length },
    accepted: new Map(),
    progress: startUploadProgress(c, "metadata", ids.length),
  };
}

/** Terminal publication stays visible; cancelled/failed runs must never start export. */
async function finishMetadataRun(ctx: MetaRunCtx, opts: MetaBatchOptions, status: Exclude<ProcessStatus, "running">): Promise<void> {
  const c = ctx.latest.current;
  c.refs.abortMeta.current = null;
  c.dispatch({ type: "running", kind: "metadata", n: 0 });
  ctx.progress.finish(status);
  if (status !== "completed") return;
  const accepted = ` — ${ctx.accepted.size} accepted`;
  c.say(`Metadata ready for ${ctx.tally.ok} of ${ctx.tally.total} icon${ctx.tally.total === 1 ? "" : "s"}${accepted}`);
  await exportAfterMetadata(ctx.latest, opts, ctx.accepted);
}

/**
 * Export selected keeps its whole-selection promise. Ordinary generation only
 * refreshes packages already on disk; it never creates unsolicited packages.
 * Both use this run's accepted states before React re-renders (RULE 24).
 */
function exportAfterMetadata(
  latest: Latest, opts: MetaBatchOptions, accepted: ReadonlyMap<string, UploadMetaState>,
): Promise<void> {
  const then = opts.thenExport?.length ? opts.thenExport
    : [...accepted.keys()].filter((id) => rowOf(latest.current, id)?.record != null);
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
  progress: ProcessReporter;
  /** What this run accepted, keyed by row id — the export's own truth. */
  accepted: Map<string, UploadMetaState>;
}

async function drainMeta(ctx: MetaRunCtx): Promise<void> {
  while (ctx.queue.length > 0 && !ctx.signal.aborted) {
    const id = ctx.queue.shift();
    if (id === undefined) return;
    // The batch tallies its own outcomes: the context re-renders asynchronously,
    // so reading the rows back here would report the pre-run state.
    const produced = await metaOne(ctx, id);
    if (produced) ctx.tally.ok += 1;
    if (ctx.signal.aborted && !produced) return;
    ctx.tally.done += 1;
    ctx.progress.advance();
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
  const result = keepUserRights(await generateMetadata({
    rowId: id, svgText, config: c.m.gemini, apiKey: ctx.key, signal: ctx.signal,
    // The prompt the editor shows is the prompt that is sent (and, later, the
    // prompt the export record names) — never a default the user cannot see.
    prompt: c.m.prompt,
    ...(prepared === null ? {} : { image: prepared.image }),
    deps: { journal: c.refs.journal.current },
  }), row.meta);
  if (result.outcome === "generated" && result.validation?.ok) {
    acceptNow(ctx, id, result);
  } else {
    applyMetaResult(ctx.latest, id, row.meta, result);
  }
  c.dispatch({ type: "run", id, run: { running: null } });
  return result.outcome === "generated" || result.outcome === "invalid";
}

/** The source could not be read: the row keeps its prior metadata, honestly. */
function unreadable(c: UploadCtx, id: string, meta: UploadMetaState): boolean {
  c.dispatch({ type: "meta", id, meta: { ...meta, detail: "the source SVG could not be read" } });
  c.dispatch({ type: "run", id, run: { running: null } });
  return false;
}

/**
 * Every valid newly generated answer is accepted automatically, with the same
 * state/cache fingerprint as manual Accept, without an intermediate draft.
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

/** Invalid answers stay unaccepted; a failure keeps the prior text/state. */
function applyMetaResult(latest: Latest, id: string, base: UploadMetaState, result: MetadataResult): void {
  const c = latest.current;
  const row = rowOf(c, id);
  c.dispatch({ type: "meta", id, meta: metaFromResult(base, result) });
  if (row === null) return;
  const ref = refOf(row);
  if (result.metadata === null) {
    if (result.outcome === "failed" || result.outcome === "cancelled") log(nameRefusedSpec({ ...ref, why: result.detail }));
    return;
  }
  // Even an invalid answer is paid work: remember its draft so fixing it does
  // not require another provider call (CP-15).
  rememberMeta(row.sourceHash ?? "", { state: "generated", meta: result.metadata });
  log(nameRefusedSpec({ ...ref, why: result.detail }));
}

/** The log's identifying half, straight off the row's source. */
export function refOf(row: UploadRow): IconRef {
  return { id: row.source.id, base: row.source.base };
}

function metaFromResult(base: UploadMetaState, result: MetadataResult): UploadMetaState {
  if (result.metadata === null) {
    return { ...base, detail: result.detail, usage: result.usage };
  }
  return {
    state: "invalid",
    metadata: result.metadata,
    validation: result.validation,
    usage: result.usage,
    detail: result.detail,
    edited: false,
  };
}

/** Regeneration replaces descriptive text, never the user's ownership claims. */
function keepUserRights(result: MetadataResult, base: UploadMetaState): MetadataResult {
  if (result.metadata === null) return result;
  const metadata = { ...result.metadata, ...metadataRights(base.metadata ?? {}) };
  return { ...result, metadata, fingerprint: metadataFingerprint(metadata) };
}
