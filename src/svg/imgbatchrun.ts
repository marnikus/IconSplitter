// imgbatchrun.ts — one confirmed square per image-edit request, one explicit
// review per multi-icon answer, and independent saves to the original pairs.
// Request-level usage is logged once and each saved cell keeps its share;
// Stop never resends uncertain outcomes.

import { cropEditedSheet, normalizedReturnedBlob, type EditedCrop } from "../lib/svgimgpixels";
import { sameImageSelection } from "../lib/svgimgbatch";
import type { Connection } from "../lib/svgconnections";
import { regenOutcome, type RegenTally } from "../lib/svgimgreg";
import { log } from "../log/logstore";
import { NO_USAGE, type Usage } from "../lib/svgrequest";
import { allocateUsage } from "../lib/svgusage";
import type { SvgCtx } from "./actions";
import { recordImageResult } from "./imgcommit";
import { taskPromptOf } from "./taskprompt";
import { loadImageJournal, removeImageRequest, saveImageJournal, upsertImageRequest, type ImageRequestEvidence } from "./imgjournal";
import { imageGroupSpec, imageSpendSuffix } from "./imglog";
import { sourceChangeReason } from "./imgstale";
import { runImageBatch, type ImageRegenItem, type ImageRegenResult } from "./imgrunner";
import type { PreparedImageGroup, PreparedImageRun } from "./imgprepare";
import type { ImageReview } from "./types";

interface CompositeRun {
  c: SvgCtx;
  prepared: PreparedImageRun;
  control: CompositeControl;
  key: string;
  id: string;
  tally: RegenTally;
  results: ImageRegenResult[];
  discarded: number;
  sent: Set<number>;
  journal: ImageRequestEvidence[];
}

interface ReviewCandidate {
  group: PreparedImageGroup;
  crops: EditedCrop[];
  result: ImageRegenResult;
  index: number;
}

interface PendingReview {
  run: CompositeRun;
  group: PreparedImageGroup;
  result: ImageRegenResult;
  crops: EditedCrop[];
  urls: string[];
  view: ImageReview;
  resolve: () => void;
  deciding: boolean;
  index: number;
}

export interface CompositeControl {
  active: boolean;
  stop: boolean;
  pending: PendingReview | null;
  current: () => SvgCtx;
}

/** A confirmed plan is immutable: the bytes shown in its dialog are sent verbatim. */
export async function runCompositeEdits(c: SvgCtx, prepared: PreparedImageRun, control: CompositeControl): Promise<void> {
  c.dispatch({ type: "dialog", dialog: null });
  const key = c.refs.key.current;
  const why = guardPrepared(c, prepared, key);
  if (why !== null || key === null) return c.say(why ?? "Add the API key first", true);
  const run: CompositeRun = { c, prepared, control, key, id: runId(),
    tally: { total: prepared.ids.length, done: 0, failed: 0, reason: null },
    results: [], discarded: 0, sent: new Set(), journal: loadImageJournal().entries };
  begin(run);
  await countPreflightFailures(run);
  try {
    await runImageBatch({ conn: prepared.conn, key, prompt: prepared.prompt, items: itemsOf(run), concurrency: 1,
      timeoutMs: Math.max(c.m.config.timeoutMs, 300_000), shouldStop: () => control.stop,
      onSend: (item) => markSent(run, item), onResult: (result, index) => landGroup(run, result, index) });
  } catch (error) {
    run.tally.reason ??= messageOf(error);
    c.say(`Image edit interrupted: ${messageOf(error)}`, true);
  } finally {
    finish(run);
  }
}

function guardPrepared(c: SvgCtx, prepared: PreparedImageRun, key: string | null): string | null {
  const dialog = c.m.dialog;
  if (dialog?.kind !== "image-regen" || !sameImageSelection(dialog.ids, prepared.ids)) return "Selection changed — review the image request again";
  if (c.refs.root.current !== prepared.root) return "Folder changed — review the image request again";
  if (taskPromptOf(c, "image.edit", prepared.ids.length) !== prepared.prompt) return "Prompt changed — review the image request again";
  const conn = c.m.connections.find((x) => x.id === c.m.activeConn);
  if (!sameConnection(conn, prepared.conn)) return "Image connection changed — review the image request again";
  if (key === null) return "Add the API key first";
  return null;
}

function sameConnection(current: Connection | undefined, sent: Connection): boolean {
  return current !== undefined && current.id === sent.id && current.model === sent.model
    && current.name === sent.name && current.baseUrl === sent.baseUrl && JSON.stringify(current.image) === JSON.stringify(sent.image);
}

function itemsOf(run: CompositeRun): ImageRegenItem[] {
  return run.prepared.groups.map((group, index) => ({
    id: `${run.id}-${index}`, fileName: `icon-grid-${index + 1}.png`, prompt: group.prompt, strict: true,
    reference: async () => {
      for (const source of group.sources) {
        const now = run.control.current();
        if (!now.rows.some((row) => row.source.id === source.row.source.id)) throw new Error(`${source.row.source.name}: the pair was removed`);
        const reason = await sourceChangeReason(run.prepared.root, source, now.refs.metas.get(source.row.source.id) ?? source.row.meta);
        if (reason !== null) throw new Error(reason);
      }
      return group.reference;
    },
  }));
}

function runId(): string {
  return `image-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function begin(run: CompositeRun): void {
  const { c, prepared } = run;
  c.setBusy(busyText(run));
  c.say(`Sending ${prepared.groups.length} confirmed image-edit request(s) via ${prepared.conn.name} for ${prepared.ids.length} icons`);
  log({ feature: "svg", action: "image-regen-start", detail: `${prepared.groups.length} requests · ${prepared.ids.length} sources · ${prepared.conn.model}` });
}

async function countPreflightFailures(run: CompositeRun): Promise<void> {
  for (const skipped of run.prepared.skipped) {
    if (run.control.stop) break;
    for (const id of skipped.ids) countFailure(run, id, `not sent — ${skipped.reason}`);
    run.c.setBusy(busyText(run));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function busyText(run: CompositeRun): string {
  return `Regenerating AI sources · ${run.tally.done + run.tally.failed + run.discarded}/${run.tally.total}`;
}

function markSent(run: CompositeRun, item: ImageRegenItem): void {
  const index = run.prepared.groups.findIndex((_, i) => item.id === `${run.id}-${i}`);
  if (index < 0) return;
  const group = run.prepared.groups[index];
  run.sent.add(index);
  const entry: ImageRequestEvidence = { id: item.id, ids: group.plan.cells.map((c) => c.id), status: "sent",
    at: Date.now(), model: run.prepared.conn.model, provider: run.prepared.conn.name, requestId: null };
  updateJournal(run, upsertImageRequest(run.journal, entry));
  run.c.dispatch({ type: "img-running", ids: entry.ids, on: true });
  run.c.say(`Request ${index + 1}/${run.prepared.groups.length} sent · ${entry.ids.length} icons`);
}

async function landGroup(run: CompositeRun, result: ImageRegenResult, index: number): Promise<void> {
  const group = run.prepared.groups[index];
  run.results.push(result);
  if (run.sent.has(index)) log(imageGroupSpec(result, run.prepared.conn.model, group.plan.cells.length));
  run.c.dispatch({ type: "img-running", ids: group.plan.cells.map((cell) => cell.id), on: false });
  if (result.status !== "done" || result.blob === undefined) {
    await groupFailure(run, group, result, index);
    return;
  }
  try {
    const image = await normalizedReturnedBlob(result.blob);
    const crops = await cropEditedSheet(group.plan, image);
    if (crops.length === 1) await applyCrops(run, group, crops, result);
    else await awaitReview(run, { group, crops, result: { ...result, blob: image }, index });
  } catch (error) {
    await groupFailure(run, group, { ...result, status: "failed", error: `returned grid could not be split (${messageOf(error)})` }, index);
    return;
  }
  if (run.control.pending === null) clearJournal(run, `${run.id}-${index}`);
  run.c.setBusy(busyText(run));
}

async function groupFailure(run: CompositeRun, group: PreparedImageGroup, result: ImageRegenResult, index: number): Promise<void> {
  const reason = result.error ?? "Image edit failed";
  const sent = run.sent.has(index);
  for (const source of group.sources) {
    if (sent) await saveOutcome(run, group, source.row, { id: source.row.source.id, status: "failed", error: reason, requestId: result.requestId, usage: shareOf(group, result) });
    else countFailure(run, source.row.source.id, reason);
  }
  if (!sent || !unknownOutcome(reason)) clearJournal(run, `${run.id}-${index}`);
  run.c.setBusy(busyText(run));
}

function unknownOutcome(reason: string): boolean {
  return /no answer within|could not reach the provider|image URL could not/i.test(reason);
}

async function awaitReview(run: CompositeRun, candidate: ReviewCandidate): Promise<void> {
  const { group, crops, result, index } = candidate;
  const urls = [URL.createObjectURL(result.blob as Blob), ...crops.map((crop) => URL.createObjectURL(crop.blob))];
  const view: ImageReview = { group: index + 1, total: run.prepared.groups.length, mosaic: urls[0], busy: false,
    cells: group.plan.cells.map((cell, i) => ({ id: cell.id, name: cell.name, url: urls[i + 1] })) };
  markReview(run, `${run.id}-${index}`, result.requestId ?? null);
  await new Promise<void>((resolve) => {
    run.control.pending = { run, group, crops, result, urls, view, resolve, deciding: false, index };
    run.c.dispatch({ type: "img-review", review: view });
    run.c.say(`Review request ${index + 1}: check all ${crops.length} icon positions before applying`);
  });
}

/** Called by the review buttons; a second click cannot commit the same cells. */
export async function decideCompositeReview(control: CompositeControl, apply: boolean): Promise<void> {
  const pending = control.pending;
  if (pending === null || pending.deciding) return;
  pending.deciding = true;
  pending.run.c.dispatch({ type: "img-review", review: { ...pending.view, busy: true } });
  try {
    if (apply) await applyCrops(pending.run, pending.group, pending.crops, pending.result);
    else discard(pending.run, pending.group);
  } catch (error) {
    for (const cell of pending.group.plan.cells) countFailure(pending.run, cell.id, messageOf(error));
  } finally {
    pending.urls.forEach((url) => URL.revokeObjectURL(url));
    pending.run.c.dispatch({ type: "img-review", review: null });
    clearJournal(pending.run, `${pending.run.id}-${pending.index}`);
    pending.run.c.setBusy(busyText(pending.run));
    control.pending = null;
    pending.resolve();
  }
}

async function applyCrops(run: CompositeRun, group: PreparedImageGroup, crops: EditedCrop[], result: ImageRegenResult): Promise<void> {
  for (const source of group.sources) {
    const crop = crops.find((item) => item.id === source.row.source.id);
    if (crop === undefined) { countFailure(run, source.row.source.id, "Returned icon cell is missing"); continue; }
    const now = run.control.current();
    const row = now.rows.find((r) => r.source.id === source.row.source.id);
    if (!row || now.refs.root.current !== run.prepared.root) { countFailure(run, source.row.source.id, "The pair or folder changed before Apply"); continue; }
    const changed = await sourceChangeReason(run.prepared.root, source, now.refs.metas.get(source.row.source.id) ?? row.meta);
    if (changed !== null) { countFailure(run, source.row.source.id, changed); continue; }
    await saveOutcome(run, group, row, { id: source.row.source.id, status: "done", blob: crop.blob, requestId: result.requestId, usage: shareOf(group, result) });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function saveOutcome(run: CompositeRun, group: PreparedImageGroup, row: PreparedImageGroup["sources"][number]["row"], result: ImageRegenResult): Promise<void> {
  try {
    const entry = await recordImageResult({ c: run.control.current(), root: run.prepared.root, conn: run.prepared.conn, prompt: group.prompt }, row, result);
    if (entry.status === "done") { run.tally.done++; run.c.say(`${row.source.name}: new main image v${entry.version} saved`); }
    else countFailure(run, row.source.id, entry.error ?? "Image version could not be saved");
  } catch (error) {
    countFailure(run, row.source.id, `${row.source.name}: ${messageOf(error)}`);
  }
}

/** Each cell's share of the one request it rode in — an estimate unless it was alone (allocateUsage). */
function shareOf(group: PreparedImageGroup, result: ImageRegenResult): Usage {
  return allocateUsage(result.usage ?? NO_USAGE, group.plan.cells.length);
}

function countFailure(run: CompositeRun, id: string, reason: string): void {
  run.tally.failed++;
  run.tally.reason ??= reason;
  log({ feature: "svg", action: "image-regen-failed", ids: { source: id }, detail: reason });
  run.c.say(`AI source ${id}: ${reason}`, true);
}

function discard(run: CompositeRun, group: PreparedImageGroup): void {
  run.discarded += group.plan.cells.length;
  run.c.say(`${group.plan.cells.length} edited icons discarded — their existing versions are unchanged`);
  log({ feature: "svg", action: "image-regen-discarded", detail: `${group.plan.cells.length} proposed icons; no versions saved` });
}

function markReview(run: CompositeRun, id: string, requestId: string | null): void {
  const current = run.journal.find((entry) => entry.id === id);
  if (current) updateJournal(run, upsertImageRequest(run.journal, { ...current, status: "review", requestId }));
}

function clearJournal(run: CompositeRun, id: string): void {
  updateJournal(run, removeImageRequest(run.journal, id));
}

function updateJournal(run: CompositeRun, entries: ImageRequestEvidence[]): void {
  run.journal = entries;
  saveImageJournal(entries);
  run.c.dispatch({ type: "img-journal", entries });
}

function finish(run: CompositeRun): void {
  const { c, tally, discarded, results, prepared } = run;
  c.dispatch({ type: "img-review", review: null });
  c.setBusy(null);
  const unsent = tally.total - tally.done - tally.failed - discarded;
  const base = discarded ? `${tally.done} saved · ${tally.failed} failed · ${discarded} discarded · ${unsent} not sent`
    : regenOutcome(tally).msg;
  c.say(`${base}${imageSpendSuffix(results, prepared.conn.model)}`, tally.failed > 0);
  log({ feature: "svg", action: "image-regen", detail: `${base}${imageSpendSuffix(results, prepared.conn.model)}`,
    data: { total: tally.total, done: tally.done, failed: tally.failed, discarded, notSent: unsent } });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
