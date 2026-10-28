// runupload.ts — batch FTPS transfer runner with per-item/per-site isolation,
// single-login session reuse per target, cancellation (RULE 7), and crash journal.

import { readBytesAt, type DirHandleLike } from "../lib/fs";
import {
  closeBridgeFtpsSession, uploadBridgeFtps, type BridgeUploadInput, type BridgeUploadResult,
} from "../lib/stockupload/bridgeclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, StockUploadPlan } from "../lib/stockupload/plan";
import { assignStockBadgeOnSend } from "../lib/stockupload/stockbadges";
import type { ExportedItem, StockFtpPreset, StockUploadOutcome, UploadFormatKey } from "../lib/stockupload/types";
import { buildRepresentationZip } from "../lib/stockupload/zippack";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import { recordSiteUploadStatus } from "./historystore";
import { clearUploadInFlight, markUploadInFlight } from "./journal";

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
}

export interface UploadBatchSummary {
  uploadedFiles: number;
  failedFiles: number;
  cancelled: boolean;
  lastError: string | null;
}

interface ItemTracker {
  expected: number;
  succeeded: UploadFormatKey[];
  missingCount: number;
  lastError: string | null;
}

async function resolveTransferBytes(
  root: DirHandleLike,
  item: ExportedItem,
  task: PlannedTransfer,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }> {
  if (task.format === "zip" && task.relPath === null) {
    const packed = await buildRepresentationZip(root, item);
    return packed.ok ? { ok: true, bytes: packed.bytes } : { ok: false, reason: packed.reason };
  }
  if (task.relPath === null) return { ok: false, reason: `${task.fileName} path missing` };
  const bytes = await readBytesAt(root, task.relPath);
  if (bytes === null || bytes.byteLength === 0) return { ok: false, reason: `${task.fileName} could not be read` };
  return { ok: true, bytes };
}

function outcomeOf(tr: ItemTracker): StockUploadOutcome {
  if (tr.succeeded.length === 0) return "failed";
  if (tr.succeeded.length === tr.expected && tr.missingCount === 0) return "uploaded";
  return "partial";
}

function flushTargetStatuses(targetId: string, trackers: Map<string, ItemTracker>): void {
  const now = new Date().toISOString();
  for (const [itemId, tr] of trackers.entries()) {
    clearUploadInFlight(itemId, targetId);
    recordSiteUploadStatus(itemId, targetId, {
      status: outcomeOf(tr),
      formats: tr.succeeded,
      uploadedAt: now,
      error: tr.lastError,
    });
  }
}

interface RunCounters {
  done: number;
  total: number;
  uploadedFiles: number;
  failedFiles: number;
  lastError: string | null;
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
    itemsById: ReadonlyMap<string, ExportedItem>;
    deps: UploadBatchDeps;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const item = ctx.itemsById.get(task.itemId);
  if (!item) return { ok: false, reason: "item no longer present" };
  const payload = await resolveTransferBytes(ctx.deps.root, item, task);
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
    setRowBadgeState(assignStockBadgeOnSend(getRowBadgeState(), state.target, task.itemId));
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

async function runTargetGroup(
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
  const closeFn = deps.closeSessionFn ?? closeBridgeFtpsSession;
  try {
    for (const task of targetTasks) {
      if (deps.signal.aborted) break;
      markUploadInFlight(task.itemId, target.id);
      const res = await runSingleTask(task, { target, creds, sessionKey, itemsById, deps });
      recordTaskResult(task, res, { target, trackers, counters, deps });
    }
  } finally {
    await closeFn(deps.bridgeUrl, sessionKey);
    flushTargetStatuses(target.id, trackers);
  }
}

export async function executeStockUploadBatch(
  plan: StockUploadPlan,
  deps: UploadBatchDeps,
): Promise<UploadBatchSummary> {
  const counters: RunCounters = {
    done: 0, total: plan.tasks.length, uploadedFiles: 0, failedFiles: 0, lastError: null,
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
  };
}
