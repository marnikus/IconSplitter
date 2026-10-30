// statusflush.ts — writes each item's upload outcome into the row status store.

import type { PlannedTransfer } from "../lib/stockupload/plan";
import type { StockFtpPreset, StockUploadOutcome } from "../lib/stockupload/types";
import { assignNamedBadge, ensureHardcodedBadges } from "../lib/upload/rowbadge";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import type { ItemTracker, RunCounters, UploadBatchDeps } from "./batchtypes";
import { recordSiteUploadStatus } from "./historystore";
import { clearUploadInFlight } from "./journal";
import { failedSpec, uploadedSpec } from "./stockuploadlog";

export function outcomeOf(tr: ItemTracker): StockUploadOutcome {
  if (tr.succeeded.length === 0) return "failed";
  if (tr.succeeded.length === tr.expected && tr.missingCount === 0) return "uploaded";
  return "partial";
}

export function flushTargetStatuses(targetId: string, trackers: Map<string, ItemTracker>): void {
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

/** What one target's run knows while it records a file; `batch` names the 100. */
interface TaskState {
  target: StockFtpPreset;
  trackers: Map<string, ItemTracker>;
  counters: RunCounters;
  deps: UploadBatchDeps;
  batch?: string;
}

/** Records one planned file's outcome and the progress line that goes with it. */
export function recordTaskResult(
  task: PlannedTransfer, res: { ok: true } | { ok: false; reason: string }, state: TaskState,
): void {
  const tr = state.trackers.get(task.itemId)!;
  if (res.ok) {
    tr.succeeded.push(task.format);
    state.counters.uploadedFiles += 1;
    // Re-derive from current saved labels on every success: user removal is not a permanent opt-out.
    const baseBadges = ensureHardcodedBadges(getRowBadgeState());
    setRowBadgeState(assignNamedBadge(baseBadges, task.itemId, task.targetName, task.targetId));
  } else {
    tr.lastError = res.reason;
    state.counters.failedFiles += 1;
    state.counters.lastError = res.reason;
  }
  recordSiteUploadStatus(task.itemId, state.target.id, {
    status: outcomeOf(tr), formats: [...tr.succeeded], uploadedAt: new Date().toISOString(), error: tr.lastError,
  });
  state.counters.done += 1;
  // The log is the trail: one line per file, and a failure carries its reason.
  state.deps.logFn?.(res.ok
    ? uploadedSpec({ target: state.target.name, file: task.fileName })
    : failedSpec({ target: state.target.name, file: task.fileName, reason: res.reason }));
  // The batch rides in the label, so a 300-icon run says which 100 is in flight.
  const where = state.batch ? `${state.target.name} ${state.batch}` : state.target.name;
  state.deps.onProgress?.({ done: state.counters.done, total: state.counters.total, label: `${where} · ${task.fileName}` });
}

/** A target without saved credentials fails every one of its files, not one. */
export function recordMissingCreds(
  target: StockFtpPreset,
  taskCount: number,
  state: { trackers: Map<string, ItemTracker>; counters: RunCounters; deps: UploadBatchDeps },
): void {
  const msg = `No saved credentials for ${target.name}`;
  for (const tr of state.trackers.values()) tr.lastError = msg;
  state.counters.failedFiles += taskCount;
  state.counters.done += taskCount;
  state.counters.lastError = msg;
  state.deps.logFn?.(failedSpec({ target: target.name, file: `${taskCount} file(s)`, reason: msg }));
  state.deps.onProgress?.({ done: state.counters.done, total: state.counters.total, label: `${target.name}: missing credentials` });
  flushTargetStatuses(target.id, state.trackers);
}

/** Surfaces an FTPS certificate warning (the run does not repeat that prompt). */
export function reportNetworkCertificate(
  res: { ok: boolean; reason?: string }, target: StockFtpPreset, deps: UploadBatchDeps,
): void {
  if ("code" in res && res.code === "cert" && "serverCertSha256" in res && typeof res.serverCertSha256 === "string") {
    deps.onCertWarning?.(target.id, res.serverCertSha256);
  }
}
