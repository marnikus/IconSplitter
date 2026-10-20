// imgactions.ts — AI source image regeneration (2026-10-16): the guarded
// request, the confirm that starts ONE run at a time, Stop, the main switch —
// and the run itself. 2026-10-19 fix (archive/2026-10-19-image-regen-fix):
// every refusal says why (RULE 2); an unreadable pair file is refused before
// anything is sent (I-43); the run marks its rows in flight, advances the busy
// pill per landed result (RULE 2/5) and records every result the moment it
// lands — version file, the in-memory copy every SVG save starts from (RC6),
// the row (RULE 24), the pair file — then says what landed, what failed and
// why. Nothing here fails silently: each result is caught on its own and the
// whole run is wrapped (RULE 4). Spend log (archive/2026-10-19-image-regen-spend-log):
// each landed request logs its tokens + cost; the summary and toast carry the sum.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { PairMeta } from "../lib/pairmeta";
import type { Connection } from "../lib/svgconnections";
import { imageWaitMs, mainImageOf, regenOutcome, type RegenTally } from "../lib/svgimgreg";
import { saveMetaAt } from "../selection/pairstore";
import { log } from "../log/logstore";
import type { SvgCtx, Slice } from "./actions";
import { imageItemSpec, imageRunSpec, imageSpendSuffix } from "./imglog";
import { readReferenceImage } from "./imgregfiles";
import { recordImageResult } from "./imgcommit";
import { decideCompositeReview, runCompositeEdits, type CompositeControl } from "./imgbatchrun";
import { loadImageJournal, removeImageRequest, saveImageJournal } from "./imgjournal";
import type { PreparedImageRun } from "./imgprepare";
import { runImageBatch, type ImageRegenItem, type ImageRegenResult } from "./imgrunner";
import type { SvgRow } from "./types";

type ImgSlice = Slice<"requestImageRegen" | "confirmImageRegen" | "stopImageRegen" | "setImageVersion" | "applyImageReview" | "discardImageReview" | "dismissImageJournal" | "retryImageUnknown">;

export function useImgRegenActions(ctx: SvgCtx): ImgSlice {
  const latest = useRef(ctx);
  latest.current = ctx;
  const control = useRef<CompositeControl>({ active: false, stop: false, pending: null, current: () => latest.current }).current;
  const requestImageRegen = useCallback((ids: string[]) => openDialog(latest.current, ids, control), [control]);
  const confirmImageRegen = useCallback((prepared: PreparedImageRun | null = null, promptOverride?: string) => {
    if (control.active) return; // a second click while the first run starts
    control.active = true;
    control.stop = false;
    const run = prepared === null ? runImageRegen(latest.current, control, promptOverride) : runCompositeEdits(latest.current, prepared, control);
    void run.catch((error: unknown) => latest.current.say(`AI source regeneration stopped: ${messageOf(error)}`, true))
      .finally(() => { control.active = false; });
  }, [control]);
  const stopImageRegen = useCallback(() => {
    if (!control.active) return;
    control.stop = true;
    latest.current.say("Stopping — requests already sent will finish; multi-icon results still need review. Nothing new is sent");
  }, [control]);
  const setImageVersion = useCallback((id: string, version: number | null) => {
    void mainOf(latest.current, id, version).catch((error: unknown) => latest.current.say(`The main image could not be changed: ${messageOf(error)}`, true));
  }, []);
  return { requestImageRegen, confirmImageRegen, stopImageRegen, setImageVersion,
    ...useImageOutcomeActions(latest, control) };
}

type OutcomeSlice = Slice<"applyImageReview" | "discardImageReview" | "dismissImageJournal" | "retryImageUnknown">;

/** A response review and a persisted unknown request have separate decisions. */
function useImageOutcomeActions(latest: { current: SvgCtx }, control: CompositeControl): OutcomeSlice {
  const applyImageReview = useCallback(() => void decideCompositeReview(control, true), [control]);
  const discardImageReview = useCallback(() => void decideCompositeReview(control, false), [control]);
  const dismissImageJournal = useCallback((id: string) => {
    const entries = id === "corrupt" ? [] : removeImageRequest(loadImageJournal().entries, id);
    saveImageJournal(entries);
    latest.current.dispatch({ type: "img-journal", entries });
    latest.current.dispatch({ type: "img-journal-warning", warning: false });
    latest.current.say("Image request note dismissed — nothing was resent");
  }, [latest]);
  const retryImageUnknown = useCallback((id: string) => {
    const entry = loadImageJournal().entries.find((item) => item.id === id);
    if (entry) openDialog(latest.current, entry.ids, control);
  }, [control, latest]);
  return { applyImageReview, discardImageReview, dismissImageJournal, retryImageUnknown };
}

/** The guarded request: a reason for every refusal, then the shared confirm dialog. */
function openDialog(c: SvgCtx, ids: string[], control: CompositeControl): void {
  const why = refusalOf(c, ids, control);
  if (why !== null) return c.say(why, true);
  // An unreadable pair file is never overwritten (I-43): refused before anything is paid for.
  const rows = ids.map((id) => c.rows.find((r) => r.source.id === id)).filter((r): r is SvgRow => r !== undefined);
  const usable = rows.filter((r) => !r.corrupt).map((r) => r.source.id);
  const unreadable = rows.length - usable.length;
  if (usable.length === 0) {
    return c.say(unreadable > 0 ? "Its pair file is unreadable — fix or remove it first; nothing was sent" : "Those sources are no longer in the list — rescan the folder", true);
  }
  if (unreadable > 0) c.say(`${unreadable} source(s) skipped — their pair file is unreadable`, true);
  c.dispatch({ type: "dialog", dialog: { kind: "image-regen", ids: usable } });
}

/** Why a regeneration cannot start now, or null. */
function refusalOf(c: SvgCtx, ids: string[], control: CompositeControl): string | null {
  if (ids.length === 0) return "Select at least one source first";
  if (control.active) return "AI source regeneration is already running — wait for it or stop it";
  if (c.m.busy !== null) return `Wait for “${c.m.busy}” to finish`;
  if (activeImageConn(c.m) === null) return "Switch to an image connection to regenerate AI sources";
  if (c.refs.key.current === null) return "Add the API key first — it lives only on this device";
  return null;
}

/** The main switch: saved first, then the in-memory copy and the row — a failed save changes nothing. */
async function mainOf(c: SvgCtx, id: string, version: number | null): Promise<void> {
  const root = c.refs.root.current as DirHandleLike | null;
  const row = c.rows.find((r) => r.source.id === id);
  if (root === null || row === undefined) return c.say("No folder is open — the choice cannot be saved", true);
  const prev = c.refs.metas.get(id) ?? row.meta;
  if (prev === null) return c.say("This pair has no record file yet — regenerate its image first", true);
  const meta: PairMeta = { ...prev, imagePreferred: version };
  try {
    await saveMetaAt(root, row.source.metaPath, meta);
  } catch (error) {
    return c.say(`The choice for ${row.source.name} could not be saved — nothing changed (${messageOf(error)})`, true);
  }
  c.refs.metas.set(id, meta);
  c.setRowsFn((rs) => rs.map((r) => (r.source.id === id ? { ...r, meta } : r)));
  log({ feature: "svg", action: "image-main", ids: { source: id }, detail: version === null ? "original" : `v${version}` });
  c.say(version === null ? "AI source: the original is main again" : `AI source: v${version} is main — the SVG generation uses it`);
}

// ── the run ───────────────────────────────────────────────────────────────

/** Everything one run needs, fixed at confirm time. */
interface ImgRun {
  c: SvgCtx;
  conn: Connection;
  root: DirHandleLike;
  rows: SvgRow[];
  prompt: string;
  tally: RegenTally;
  /** Every outcome that landed, for the summed spend. */
  results: ImageRegenResult[];
}

/** The active connection record, or null when it is not an image one. */
function activeImageConn(m: SvgCtx["m"]): Connection | null {
  const conn = m.connections.find((c) => c.id === m.activeConn);
  return conn !== undefined && conn.kind === "image" ? conn : null;
}

/** Confirm: close the dialog, then run; every outcome is reported. */
async function runImageRegen(c: SvgCtx, control: CompositeControl, promptOverride?: string): Promise<void> {
  const run = runOf(c, promptOverride);
  c.dispatch({ type: "dialog", dialog: null });
  if (typeof run === "string") return c.say(run, true);
  begin(run);
  try {
    await runImageBatch({
      conn: run.conn, key: c.refs.key.current ?? "", prompt: run.prompt,
      items: run.rows.map((r) => referenceItem(run.root, r)),
      concurrency: c.m.config.concurrency, timeoutMs: imageWaitMs(c.m.config.timeoutMs),
      shouldStop: () => control.stop,
      onResult: (result, i) => land(run, run.rows[i], result),
    });
  } catch (error) {
    run.tally.reason ??= messageOf(error);
  } finally {
    finish(run);
  }
}

/** The run the open dialog asks for, or the reason it cannot start. */
function runOf(c: SvgCtx, promptOverride?: string): ImgRun | string {
  const dialog = c.m.dialog;
  const conn = activeImageConn(c.m);
  const root = c.refs.root.current as DirHandleLike | null;
  const prompt = promptOverride ?? c.m.prompt;
  if (dialog === null || dialog.kind !== "image-regen") return "Nothing to regenerate — the dialog was closed";
  if (conn === null) return "Switch to an image connection to regenerate AI sources";
  if (root === null) return "The folder is gone — pick it again";
  if (prompt.trim() === "") return "Write a prompt first — nothing was sent";
  const rows = dialog.ids.map((id) => c.rows.find((r) => r.source.id === id)).filter((r): r is SvgRow => r !== undefined);
  if (rows.length === 0) return "Those sources are no longer in the list — rescan the folder";
  return { c, conn, root, rows, prompt, tally: { total: rows.length, done: 0, failed: 0, reason: null }, results: [] };
}

/**
 * What one row sends (2026-10-19): the prompt travels with the row's CURRENT
 * main AI image — the same file the thumbnail shows and the SVG generation
 * reads (mainImageOf). The path is fixed now; the bytes are read when the
 * request starts (lazy — a large batch never holds every image in memory).
 */
function referenceItem(root: DirHandleLike, row: SvgRow): ImageRegenItem {
  const path = mainImageOf(row.meta, row.source.relPath);
  return { id: row.source.id, fileName: path.slice(path.lastIndexOf("/") + 1), reference: () => readReferenceImage(root, path) };
}

const busyText = (run: ImgRun) => `Regenerating AI sources · ${run.tally.done + run.tally.failed}/${run.tally.total}`;

function begin(run: ImgRun): void {
  const { c, rows, conn } = run;
  c.dispatch({ type: "img-running", ids: rows.map((r) => r.source.id), on: true });
  c.setBusy(busyText(run));
  c.say(`Regenerating ${rows.length} AI source${rows.length === 1 ? "" : "s"} via ${conn.name} from the current image + prompt — each can take a minute or two`);
  log({ feature: "svg", action: "image-regen-start", detail: `${rows.length} · ${conn.model}` });
}

/** One outcome, recorded the moment it lands; its failure never stops the others (RULE 5). */
async function land(run: ImgRun, row: SvgRow, result: ImageRegenResult): Promise<void> {
  run.results.push(result);
  if (result.status === "done") log(imageItemSpec(result, run.conn.model));
  try {
    const entry = await recordImageResult(run, row, result);
    count(run, row, entry.status === "done" ? null : entry.error ?? "unknown error");
  } catch (error) {
    count(run, row, `${row.source.name}: ${messageOf(error)}`);
  } finally {
    run.c.dispatch({ type: "img-running", ids: [row.source.id], on: false });
    run.c.setBusy(busyText(run));
  }
}

function count(run: ImgRun, row: SvgRow, failure: string | null): void {
  if (failure === null) {
    run.tally.done += 1;
    return;
  }
  run.tally.failed += 1;
  run.tally.reason ??= failure;
  log({ feature: "svg", action: "image-regen-failed", ids: { source: row.source.id }, detail: failure });
}

function finish(run: ImgRun): void {
  const { c, rows } = run;
  c.dispatch({ type: "img-running", ids: rows.map((r) => r.source.id), on: false });
  c.setBusy(null);
  const out = regenOutcome(run.tally);
  c.say(`${out.msg}${imageSpendSuffix(run.results, run.conn.model)}`, out.err);
  log(imageRunSpec(run.results, run.conn.model, run.tally));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
