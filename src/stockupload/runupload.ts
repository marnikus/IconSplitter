// runupload.ts — batch FTPS transfer runner with per-item/per-site isolation,
// single-login session reuse per target, cancellation (RULE 7), and crash journal.

import type { DirHandleLike } from "../lib/fs";
import {
  closeBridgeFtpsSession, uploadBridgeFtps, type BridgeUploadInput, type BridgeUploadResult,
} from "../lib/stockupload/bridgeclient";
import { GETTY_WEB_SUBMISSION_TYPE, gettyWebBatchName } from "../lib/stockupload/gettyweb";
import {
  closeBridgeGettyWeb, type GettyWebFinishInput, type GettyWebResult, type GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";
import { assignNamedBadge, ensureHardcodedBadges } from "../lib/upload/rowbadge";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import { groupEspTasks, uploadEspGroup } from "./esptransfer";
import { finishGettyWebRun } from "./gettywebfinish";
import { completionNote, uploadGettyWebGroup } from "./gettywebtransfer";
import { recordSiteUploadStatus } from "./historystore";
import { markUploadInFlight } from "./journal";
import { flushTargetStatuses, outcomeOf } from "./statusflush";
import type { ItemTracker } from "./trackers";
import { resolveTransferBytes } from "./transferpayload";

export interface UploadProgressStep {
  done: number;
  total: number;
  label: string;
}

export interface UploadBatchDeps {
  root: DirHandleLike;
  bridgeUrl: string;
  signal: AbortSignal;
  loadCreds: (presetId: string) => Promise<FtpCredentials | null>;
  onProgress?: (step: UploadProgressStep) => void;
  onCertWarning?: (presetId: string, sha256: string) => void;
  uploadFn?: (input: BridgeUploadInput) => Promise<BridgeUploadResult>;
  closeSessionFn?: (bridgeUrl: string, sessionKey: string) => Promise<void>;
  gettyWebUploadFn?: (input: GettyWebUploadInput) => Promise<GettyWebResult>;
  closeGettyWebFn?: (bridgeUrl: string, sessionKey: string) => Promise<void>;
  finishGettyWebFn?: (input: GettyWebFinishInput) => Promise<GettyWebResult>;
}

export interface UploadBatchSummary {
  uploadedFiles: number;
  failedFiles: number;
  cancelled: boolean;
  lastError: string | null;
  stagedDir?: string | null;
}

interface RunCounters {
  done: number;
  total: number;
  uploadedFiles: number;
  failedFiles: number;
  lastError: string | null;
  stagedDir: string | null;
}

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

function recordMissingCreds(
  target: StockFtpPreset,
  taskCount: number,
  state: { trackers: Map<string, ItemTracker>; counters: RunCounters; deps: UploadBatchDeps },
): void {
  const msg = `No saved credentials for ${target.name}`;
  for (const tr of state.trackers.values()) tr.lastError = msg;
  state.counters.failedFiles += taskCount;
  state.counters.done += taskCount;
  state.counters.lastError = msg;
  state.deps.onProgress?.({ done: state.counters.done, total: state.counters.total, label: `${target.name}: missing credentials` });
  flushTargetStatuses(target.id, state.trackers);
}

function recordTaskResult(
  task: PlannedTransfer,
  res: { ok: true } | { ok: false; reason: string },
  state: { target: StockFtpPreset; trackers: Map<string, ItemTracker>; counters: RunCounters; deps: UploadBatchDeps },
): void {
  const tr = state.trackers.get(task.itemId)!;
  if (res.ok) {
    tr.succeeded.push(task.format);
    state.counters.uploadedFiles += 1;
    const baseBadges = ensureHardcodedBadges(getRowBadgeState());
    setRowBadgeState(assignNamedBadge(baseBadges, task.itemId, state.target.name, state.target.id));
  } else {
    tr.lastError = res.reason;
    state.counters.failedFiles += 1;
    state.counters.lastError = res.reason;
  }
  recordSiteUploadStatus(task.itemId, state.target.id, {
    status: outcomeOf(tr), formats: [...tr.succeeded], uploadedAt: new Date().toISOString(), error: tr.lastError,
  });
  state.counters.done += 1;
  state.deps.onProgress?.({
    done: state.counters.done, total: state.counters.total, label: `${state.target.name} · ${task.fileName}`,
  });
}

function rejectLocalEspStage(plan: StockUploadPlan, target: StockFtpPreset, deps: UploadBatchDeps, counters: RunCounters): void {
  const tasks = plan.tasks.filter((t) => t.targetId === target.id);
  const trackers = buildTrackers(plan, tasks);
  const result = { ok: false as const, reason: "Local staging is not an upload. Select the Getty ESP API connection." };
  for (const task of tasks) recordTaskResult(task, result, { target, trackers, counters, deps });
  flushTargetStatuses(target.id, trackers);
}

function reportNetworkCertificate(res: { ok: boolean; reason?: string }, target: StockFtpPreset, deps: UploadBatchDeps): void {
  if ("code" in res && res.code === "cert" && "serverCertSha256" in res && typeof res.serverCertSha256 === "string") {
    deps.onCertWarning?.(target.id, res.serverCertSha256);
  }
}

type UploadResult = BridgeUploadResult | GettyWebResult | { ok: true } | { ok: false; reason: string };

interface GroupRun {
  plan: StockUploadPlan; target: StockFtpPreset; tasks: PlannedTransfer[]; deps: UploadBatchDeps;
  creds: FtpCredentials; sessionKey: string; itemsById: ReadonlyMap<string, ExportedItem>;
}

/** One group = one icon for Getty protocols, one file for every other stock. */
function uploadGroup(run: GroupRun): Promise<UploadResult> {
  const { plan, target, tasks, deps, creds, sessionKey, itemsById } = run;
  const item = itemsById.get(tasks[0].itemId);
  if (target.protocol === "esp-https") {
    return uploadEspGroup({ tasks, missing: plan.skippedMissing, root: deps.root, bridgeUrl: deps.bridgeUrl,
      target, creds, sessionKey, signal: deps.signal, uploadFn: deps.uploadFn, item, combine: plan.combineTitleDescription });
  }
  if (target.protocol === "getty-web") {
    return uploadGettyWebGroup({ tasks, missing: plan.skippedMissing, root: deps.root, target, creds, item,
      combine: plan.combineTitleDescription, batchName: gettyWebBatchName(new Date(), plan.selectedRows.length),
      submissionType: GETTY_WEB_SUBMISSION_TYPE, sessionKey, bridgeUrl: deps.bridgeUrl, signal: deps.signal,
      uploadFn: deps.gettyWebUploadFn });
  }
  return runSingleTask(tasks[0], { target, creds, sessionKey, itemsById, deps, combine: plan.combineTitleDescription });
}

function groupUploadTasks(target: StockFtpPreset, targetTasks: PlannedTransfer[]): PlannedTransfer[][] {
  const perIcon = target.protocol === "esp-https" || target.protocol === "getty-web";
  return perIcon ? groupEspTasks(targetTasks) : targetTasks.map((task) => [task]);
}

async function runNetworkGroups(ctx: {
  plan: StockUploadPlan; target: StockFtpPreset; targetTasks: PlannedTransfer[]; deps: UploadBatchDeps;
  counters: RunCounters; trackers: Map<string, ItemTracker>; creds: FtpCredentials; sessionKey: string;
  itemsById: ReadonlyMap<string, ExportedItem>;
}): Promise<number> {
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

/** Submits the run's one batch once the last icon is in it, and says so. */
async function submitGettyBatch(
  target: StockFtpPreset, creds: FtpCredentials, deps: UploadBatchDeps,
  run: { counters: RunCounters; sessionKey: string; uploaded: number },
): Promise<void> {
  const { counters, sessionKey, uploaded } = run;
  if (target.protocol !== "getty-web" || deps.signal.aborted) return;
  const fin = await finishGettyWebRun({
    bridgeUrl: deps.bridgeUrl, preset: target, creds, sessionKey, uploaded, finishFn: deps.finishGettyWebFn,
  });
  if (fin.error ?? fin.note) counters.lastError = fin.error ?? fin.note;
  if (fin.submitted) deps.onProgress?.({ done: counters.done, total: counters.total, label: `${target.name}: batch submitted` });
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
  try {
    const uploaded = await runNetworkGroups({ plan, target, targetTasks, deps, counters, trackers, creds, sessionKey, itemsById });
    await submitGettyBatch(target, creds, deps, { counters, sessionKey, uploaded });
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
    done: 0, total: plan.tasks.length, uploadedFiles: 0, failedFiles: 0, lastError: null, stagedDir: null,
  };
  for (const target of plan.targets) {
    if (deps.signal.aborted) break;
    await runTargetGroup(plan, target, deps, counters);
  }
  return {
    uploadedFiles: counters.uploadedFiles,
    failedFiles: counters.failedFiles,
    cancelled: deps.signal.aborted,
    lastError: counters.lastError,
    stagedDir: counters.stagedDir,
  };
}
