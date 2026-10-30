// runupload.ts — batch FTPS transfer runner with per-item/per-site isolation,
// single-login session reuse per target, cancellation (RULE 7), and crash journal.

import {
  closeBridgeFtpsSession, uploadBridgeFtps, type BridgeUploadResult,
} from "../lib/stockupload/bridgeclient";
import { GETTY_WEB_SUBMISSION_TYPE } from "../lib/stockupload/gettyweb";
import { closeBridgeGettyWeb, type GettyWebResult } from "../lib/stockupload/gettywebclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { GettyWebProgress } from "../lib/stockupload/gettyprogress";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";
import type { ItemTracker, RunCounters, UploadBatchDeps, UploadBatchSummary } from "./batchtypes";
import { groupEspTasks, uploadEspGroup } from "./esptransfer";
import {
  progressLabel, progressPhase, settledFiles, watchGettyProgress,
} from "./gettywebprogress";
import {
  completionNote, uploadGettyWebRun, type GettyWebIconInput, type GettyWebRunOutcome,
} from "./gettywebtransfer";
import { markUploadInFlight } from "./journal";
import {
  flushTargetStatuses, recordMissingCreds, recordTaskResult, reportNetworkCertificate,
} from "./statusflush";
import {
  batchReadySpec, batchSplitSpec, batchSubmittedSpec, pageReloadedSpec, reloadNoteOf, runFinishedSpec,
  runStartedSpec,
} from "./stockuploadlog";
import { resolveTransferBytes } from "./transferpayload";

export type { UploadBatchDeps, UploadBatchSummary, UploadProgressStep } from "./batchtypes";

function buildTrackers(plan: StockUploadPlan, targetTasks: readonly PlannedTransfer[]): Map<string, ItemTracker> {
  const map = new Map<string, ItemTracker>();
  for (const t of targetTasks) {
    const missingCount = plan.skippedMissing.filter((m) => m.itemId === t.itemId).length;
    const prev = map.get(t.itemId) ?? { expected: 0, succeeded: [], missingCount, lastError: null };
    prev.expected += 1;
    map.set(t.itemId, prev);
  }
  return map;
}

async function runSingleTask(
  task: PlannedTransfer,
  ctx: {
    target: StockFtpPreset;
    creds: FtpCredentials;
    sessionKey: string;
    combine: boolean;
    itemsById: ReadonlyMap<string, ExportedItem>;
    deps: UploadBatchDeps;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const item = ctx.itemsById.get(task.itemId);
  if (!item) return { ok: false, reason: "item no longer present" };
  const payload = await resolveTransferBytes(ctx.deps.root, item, task, ctx.combine);
  if (!payload.ok) return payload;
  const upload = ctx.deps.uploadFn ?? uploadBridgeFtps;
  const res = await upload({
    bridgeUrl: ctx.deps.bridgeUrl,
    preset: ctx.target,
    creds: ctx.creds,
    fileName: task.fileName,
    bytes: payload.bytes,
    sessionKey: ctx.sessionKey,
    signal: ctx.deps.signal,
  });
  if (res.ok) return { ok: true };
  if (res.code === "cert" && res.serverCertSha256) ctx.deps.onCertWarning?.(ctx.target.id, res.serverCertSha256);
  return { ok: false, reason: res.reason };
}

function rejectLocalEspStage(plan: StockUploadPlan, target: StockFtpPreset, deps: UploadBatchDeps, counters: RunCounters): void {
  const tasks = plan.tasks.filter((t) => t.targetId === target.id);
  const trackers = buildTrackers(plan, tasks);
  const result = { ok: false as const, reason: "Local staging is not an upload. Select the Getty ESP API connection." };
  for (const task of tasks) recordTaskResult(task, result, { target, trackers, counters, deps });
  flushTargetStatuses(target.id, trackers);
}

type UploadResult = BridgeUploadResult | GettyWebResult | { ok: true } | { ok: false; reason: string };

interface GroupRun {
  plan: StockUploadPlan; target: StockFtpPreset; tasks: PlannedTransfer[]; deps: UploadBatchDeps;
  creds: FtpCredentials; sessionKey: string; itemsById: ReadonlyMap<string, ExportedItem>;
}

/** One group = one icon for the Getty ESP API, one file for every other stock. */
function uploadGroup(run: GroupRun): Promise<UploadResult> {
  const { plan, target, tasks, deps, creds, sessionKey, itemsById } = run;
  const item = itemsById.get(tasks[0].itemId);
  if (target.protocol === "esp-https") {
    return uploadEspGroup({ tasks, missing: plan.skippedMissing, root: deps.root, bridgeUrl: deps.bridgeUrl,
      target, creds, sessionKey, signal: deps.signal, uploadFn: deps.uploadFn, item, combine: plan.combineTitleDescription });
  }
  return runSingleTask(tasks[0], { target, creds, sessionKey, itemsById, deps, combine: plan.combineTitleDescription });
}

function groupUploadTasks(target: StockFtpPreset, targetTasks: PlannedTransfer[]): PlannedTransfer[][] {
  return target.protocol === "esp-https" ? groupEspTasks(targetTasks) : targetTasks.map((task) => [task]);
}

/** Everything one target's run needs; shared by both transfer loops. */
interface NetworkCtx {
  plan: StockUploadPlan; target: StockFtpPreset; targetTasks: PlannedTransfer[]; deps: UploadBatchDeps;
  counters: RunCounters; trackers: Map<string, ItemTracker>; creds: FtpCredentials; sessionKey: string;
  itemsById: ReadonlyMap<string, ExportedItem>;
}

async function runNetworkGroups(ctx: NetworkCtx): Promise<number> {
  const { plan, target, targetTasks, deps, counters, trackers, creds, sessionKey, itemsById } = ctx;
  let uploaded = 0;
  for (const tasks of groupUploadTasks(target, targetTasks)) {
    if (deps.signal.aborted) break;
    markUploadInFlight(tasks[0].itemId, target.id);
    const res = await uploadGroup({ plan, target, tasks, deps, creds, sessionKey, itemsById });
    if (!res.ok) reportNetworkCertificate(res, target, deps);
    else uploaded += 1;
    counters.lastError = completionNote(res) ?? counters.lastError;
    for (const task of tasks) recordTaskResult(task, res, { target, trackers, counters, deps });
  }
  return uploaded;
}

/** Where the bar stands: what closed batches proved, and this batch's count. */
interface ProgressBound { base: number; seen: number; batchNo: number; batch: string; reloads: number }

/** A new batch banks the last one's count, so the bar never falls back to zero. */
function rebaseOnBatch(bound: ProgressBound, progress: GettyWebProgress, total: number): void {
  if (progress.batch === undefined || progress.batch === bound.batchNo) return;
  bound.base = Math.min(total, bound.base + bound.seen);
  bound.batchNo = progress.batch;
  bound.seen = 0;
  bound.reloads = 0;
}

/** A reload is a fact worth keeping: it explains a long silence in the run. */
function noteReload(ctx: NetworkCtx, bound: ProgressBound, reloads: number): void {
  const reload = reloadNoteOf(bound.reloads, reloads);
  if (reload === null) return;
  bound.reloads = reload;
  ctx.deps.logFn?.(pageReloadedSpec({ target: ctx.target.name, reloads: reload }));
}

/** Getty's live counts in the panel: every card that turns moves the bar at once,
 *  across the whole run — the total carries from batch to batch. */
function liveGettyProgress(ctx: NetworkCtx): { stop: () => void; onBatch: (label: string) => void } {
  const bound: ProgressBound = { base: 0, seen: 0, batchNo: 0, batch: "", reloads: 0 };
  const stop = watchGettyProgress(
    { bridgeUrl: ctx.deps.bridgeUrl, sessionKey: ctx.sessionKey, targetName: ctx.target.name },
    (progress) => {
      rebaseOnBatch(bound, progress, ctx.counters.total);
      bound.seen = settledFiles(progress);
      noteReload(ctx, bound, progress.reloads);
      ctx.deps.onProgress?.({
        done: Math.min(ctx.counters.total, bound.base + bound.seen),
        total: ctx.counters.total,
        // The bar may only say "complete" once Getty validated every card, so the
        // stage travels with the counts: bytes in, or chips flipping.
        phase: progressPhase(progress),
        label: progressLabel(progress, ctx.target.name, bound.batch),
      });
    },
    ctx.deps.gettyWebProgressFn,
  );
  // A new batch owns the page now; its counts are named by the reading itself.
  return { stop, onBatch: (label) => { bound.batch = label; } };
}

/** One log line per closed batch; a batch name is a count, never a file name. */
function logBatchFinished(
  ctx: NetworkCtx, info: { label: string; uploaded: number; submitted: boolean; ready: boolean },
): void {
  const where = info.label === "" ? ctx.target.name : `${ctx.target.name} ${info.label}`;
  if (info.submitted) { ctx.deps.logFn?.(batchSubmittedSpec(where)); return; }
  if (info.ready) ctx.deps.logFn?.(batchReadySpec({ target: where, files: info.uploaded }));
}

/**
 * The Getty web target uploads in batches of at most 100 icons: each chunk is
 * one request, completed on the web before the next one, and an icon Getty did
 * not take is retried once before it is called failed.
 */
/** One terminal outcome per icon: uploaded, or the reason it needs a re-upload. */
function recordIconOutcomes(
  ctx: NetworkCtx, icons: readonly GettyWebIconInput[], res: GettyWebRunOutcome,
): number {
  let uploaded = 0;
  icons.forEach((icon, index) => {
    const outcome = res.icons[index] ?? { ok: false, reason: res.reason };
    if (outcome.ok) uploaded += 1;
    else ctx.counters.lastError = outcome.reason;
    for (const task of icon.tasks) {
      recordTaskResult(task, outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason }, ctx);
    }
  });
  return uploaded;
}

async function runGettyWebIcons(ctx: NetworkCtx): Promise<number> {
  const icons = groupEspTasks(ctx.targetTasks).map((tasks) => ({
    tasks, missing: ctx.plan.skippedMissing, item: ctx.itemsById.get(tasks[0].itemId),
  }));
  for (const icon of icons) markUploadInFlight(icon.tasks[0].itemId, ctx.target.id);
  // Getty reports each file while the batch is in flight; show that live.
  const progress = liveGettyProgress(ctx);
  const res = await uploadGettyWebRun({
    icons, root: ctx.deps.root, target: ctx.target, creds: ctx.creds,
    combine: ctx.plan.combineTitleDescription,
    submissionType: GETTY_WEB_SUBMISSION_TYPE, sessionKey: ctx.sessionKey,
    bridgeUrl: ctx.deps.bridgeUrl, signal: ctx.deps.signal,
    uploadFn: ctx.deps.gettyWebUploadFn, finishFn: ctx.deps.finishGettyWebFn,
    maxIcons: ctx.deps.gettyWebMaxIcons, maxBytes: ctx.deps.gettyWebMaxBytes,
    randomizeBatches: ctx.deps.gettyWebRandomBatches, rng: ctx.deps.gettyWebRandomFn,
    onBatch: progress.onBatch,
    onBatchFinished: (info) => logBatchFinished(ctx, info),
    onNote: (note) => ctx.deps.logFn?.(batchSplitSpec({ target: ctx.target.name, note })),
  }).finally(progress.stop);
  const uploaded = recordIconOutcomes(ctx, icons, res);
  // A batch that could not be completed speaks for the whole run, after the
  // per-icon reasons (which name the files).
  if (res.batchError !== null) {
    ctx.counters.lastError = [ctx.counters.lastError, res.batchError].filter(Boolean).join(" — ");
  }
  // The icons still missing after their retry are the tab's re-upload list.
  ctx.counters.reuploadIcons = res.failed;
  return uploaded;
}

async function runNetworkTargetGroup(
  plan: StockUploadPlan,
  target: StockFtpPreset,
  deps: UploadBatchDeps,
  counters: RunCounters,
): Promise<void> {
  const targetTasks = plan.tasks.filter((t) => t.targetId === target.id);
  if (targetTasks.length === 0) return;
  const trackers = buildTrackers(plan, targetTasks);
  const creds = await deps.loadCreds(target.id);
  if (creds === null) {
    recordMissingCreds(target, targetTasks.length, { trackers, counters, deps });
    return;
  }
  const itemsById = new Map(plan.selectedRows.map((r) => [r.id, r]));
  const sessionKey = `${target.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ctx: NetworkCtx = { plan, target, targetTasks, deps, counters, trackers, creds, sessionKey, itemsById };
  try {
    if (target.protocol === "getty-web") await runGettyWebIcons(ctx);
    else await runNetworkGroups(ctx);
  } finally {
    const close = target.protocol === "getty-web"
      ? (deps.closeGettyWebFn ?? closeBridgeGettyWeb)
      : (deps.closeSessionFn ?? closeBridgeFtpsSession);
    await close(deps.bridgeUrl, sessionKey);
    flushTargetStatuses(target.id, trackers);
  }
}

async function runTargetGroup(
  plan: StockUploadPlan,
  target: StockFtpPreset,
  deps: UploadBatchDeps,
  counters: RunCounters,
): Promise<void> {
  if (target.protocol === "esp-batch") {
    rejectLocalEspStage(plan, target, deps, counters);
    return;
  }
  await runNetworkTargetGroup(plan, target, deps, counters);
}

export async function executeStockUploadBatch(
  plan: StockUploadPlan,
  deps: UploadBatchDeps,
): Promise<UploadBatchSummary> {
  const counters: RunCounters = {
    done: 0, total: plan.tasks.length, uploadedFiles: 0, failedFiles: 0, reuploadIcons: 0,
    lastError: null, stagedDir: null,
  };
  deps.logFn?.(runStartedSpec({ targets: plan.targets.map((t) => t.name), files: plan.tasks.length }));
  for (const target of plan.targets) {
    if (deps.signal.aborted) break;
    await runTargetGroup(plan, target, deps, counters);
  }
  deps.logFn?.(runFinishedSpec({
    uploaded: counters.uploadedFiles, failed: counters.failedFiles,
    cancelled: deps.signal.aborted, lastError: counters.lastError,
  }));
  return {
    uploadedFiles: counters.uploadedFiles,
    failedFiles: counters.failedFiles,
    cancelled: deps.signal.aborted,
    lastError: counters.lastError,
    stagedDir: counters.stagedDir,
    reuploadIcons: counters.reuploadIcons,
  };
}
